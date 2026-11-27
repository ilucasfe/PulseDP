const TOKEN_KEY = "pulsedp_token";
const THEME_KEY = "pulsedp_theme";

let state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  companies: [],
  activeCompany: null,
  employees: [],
  payrolls: [],
  users: [],
  activeTab: "dashboard"
};

function formatCurrency(value = 0) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "EM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Erro na requisição.");
  }
  return data;
}

function setAuthError(msg = "") {
  const el = document.getElementById("authError");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function showAuthScreen() {
  document.getElementById("authView").hidden = false;
  document.getElementById("appShell").hidden = true;
}

function showAppScreen() {
  document.getElementById("authView").hidden = true;
  document.getElementById("appShell").hidden = false;
}

function applySessionData(payload) {
  if (payload.token) {
    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, payload.token);
  }
  state.user = payload.user;
  state.companies = payload.companies || [];
  state.activeCompany = payload.activeCompany || null;
}

function renderSwitcher() {
  const active = state.activeCompany;
  const envBadge = document.getElementById("envBadge");
  const isDemo = Boolean(active && (active.isDemo || active.environment === "demo"));

  envBadge.textContent = isDemo ? "DEMO" : "PRODUÇÃO";
  envBadge.className = `env-pill ${isDemo ? "env-demo" : "env-prod"}`;

  if (active) {
    document.getElementById("activeCompanyAvatar").textContent =
      active.initials || getInitials(active.name);
    document.getElementById("activeCompanyName").textContent = active.name;
    document.getElementById("activeCompanyCnpj").textContent =
      active.cnpj || "Sem CNPJ informado";
    document.getElementById("activeCompanyStatusTag").textContent = isDemo
      ? "Ambiente Demonstrativo • Dados Seed"
      : "Ambiente de Produção • Dados Isolados";
  }

  const listEl = document.getElementById("companyList");
  listEl.innerHTML = "";

  for (const company of state.companies) {
    const selected = active && String(company._id) === String(active._id);
    const companyIsDemo = Boolean(company.isDemo || company.environment === "demo");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `company-item ${selected ? "is-selected" : ""}`;
    btn.innerHTML = `
      <span class="company-avatar">${company.initials || getInitials(company.name)}</span>
      <span class="company-meta">
        <strong>
          ${company.name}
          ${companyIsDemo ? '<span class="badge-demo">DEMO</span>' : ""}
        </strong>
        <small>${company.cnpj || "Sem CNPJ"}</small>
      </span>
      ${selected ? '<span class="company-check">✓</span>' : ""}
    `;
    btn.addEventListener("click", async () => {
      document.getElementById("companyDropdown").hidden = true;
      if (!selected) {
        const updated = await apiFetch("/api/companies/switch", {
          method: "POST",
          body: JSON.stringify({ companyId: company._id })
        });
        applySessionData(updated);
        await loadCompanyWorkspace();
      }
    });
    listEl.appendChild(btn);
  }
}

function renderUserFooter() {
  if (!state.user) return;
  document.getElementById("currentUserName").textContent = state.user.name;
  document.getElementById("currentUserEmail").textContent = state.user.email;
}

function renderDashboard() {
  document.getElementById("kpiEmployeesCount").textContent = state.employees.length;
  document.getElementById("kpiPayrollsCount").textContent = state.payrolls.length;
  const netTotal = state.payrolls.reduce((acc, p) => acc + Number(p.netSalary || 0), 0);
  document.getElementById("kpiNetTotal").textContent = formatCurrency(netTotal);
  document.getElementById("kpiUsersCount").textContent = state.users.length;
}

function renderEmployees() {
  const tbody = document.getElementById("employeesTableBody");
  const select = document.getElementById("payEmployeeId");

  if (!state.employees.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Nenhum colaborador cadastrado nesta empresa.</td></tr>`;
    select.innerHTML = `<option value="">Cadastre um colaborador primeiro</option>`;
    return;
  }

  tbody.innerHTML = state.employees
    .map(
      (e) => `
      <tr>
        <td><strong>${e.name}</strong></td>
        <td>${e.cpf}</td>
        <td>${e.role || "-"}</td>
        <td>${e.esocialLayout}</td>
        <td>${formatCurrency(e.baseSalary)}</td>
        <td>${e.status}</td>
      </tr>
    `
    )
    .join("");

  select.innerHTML = state.employees
    .map((e) => `<option value="${e._id}" data-salary="${e.baseSalary}">${e.name} (${e.cpf})</option>`)
    .join("");

  const firstEmp = state.employees[0];
  if (firstEmp && !document.getElementById("payGross").value) {
    document.getElementById("payGross").value = firstEmp.baseSalary;
  }
}

function renderPayrolls() {
  const tbody = document.getElementById("payrollsTableBody");
  if (!state.payrolls.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nenhuma folha calculada nesta empresa.</td></tr>`;
    return;
  }

  const typeLabels = {
    mensal: "Folha Mensal",
    ferias: "Férias",
    decimo_terceiro: "13º Salário",
    rescisao: "Rescisão"
  };

  tbody.innerHTML = state.payrolls
    .map((p) => {
      const gross = Number(p.grossSalary || 0) + Number(p.extras || 0);
      const ded = Number(p.inss || 0) + Number(p.irrf || 0) + Number(p.otherDeductions || 0);
      return `
        <tr>
          <td><strong>${p.employeeName}</strong></td>
          <td>${typeLabels[p.type] || p.type}</td>
          <td>${p.competence}</td>
          <td>${formatCurrency(gross)}</td>
          <td>${formatCurrency(ded)}</td>
          <td>${formatCurrency(p.fgts)}</td>
          <td><strong>${formatCurrency(p.netSalary)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!state.users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum usuário vinculado.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.users
    .map(
      (u) => `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.active ? "Ativo" : "Inativo"}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleUserActive('${u._id}', ${!u.active})">
            ${u.active ? "Desativar" : "Ativar"}
          </button>
        </td>
      </tr>
    `
    )
    .join("");
}

window.toggleUserActive = async function (userId, nextActive) {
  try {
    await apiFetch(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: nextActive })
    });
    await loadCompanyWorkspace();
  } catch (err) {
    alert(err.message);
  }
};

function renderManageCompaniesModal() {
  const container = document.getElementById("manageCompaniesList");
  container.innerHTML = state.companies
    .map((c) => {
      const isSelected = state.activeCompany && String(c._id) === String(state.activeCompany._id);
      const isDemo = Boolean(c.isDemo || c.environment === "demo");
      return `
        <div class="manage-item">
          <div>
            <strong>${c.name}</strong> ${isDemo ? '<span class="badge-demo">DEMO</span>' : ""}
            <div class="muted">${c.cnpj || "Sem CNPJ"} • Ambiente: ${c.environment}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="selectCompanyFromModal('${c._id}')">
            ${isSelected ? "Ativa" : "Selecionar"}
          </button>
        </div>
      `;
    })
    .join("");
}

window.selectCompanyFromModal = async function (companyId) {
  const updated = await apiFetch("/api/companies/switch", {
    method: "POST",
    body: JSON.stringify({ companyId })
  });
  applySessionData(updated);
  document.getElementById("modalManageCompanies").hidden = true;
  await loadCompanyWorkspace();
};

async function loadCompanyWorkspace() {
  renderSwitcher();
  renderUserFooter();

  // Limpa estado anterior antes de buscar dados da empresa ativa
  state.employees = [];
  state.payrolls = [];
  state.users = [];

  if (!state.activeCompany) {
    renderDashboard();
    renderEmployees();
    renderPayrolls();
    renderUsers();
    return;
  }

  const [empData, payData, usrData] = await Promise.all([
    apiFetch("/api/employees"),
    apiFetch("/api/payrolls"),
    apiFetch("/api/users")
  ]);

  state.employees = empData.employees || [];
  state.payrolls = payData.payrolls || [];
  state.users = usrData.users || [];

  renderDashboard();
  renderEmployees();
  renderPayrolls();
  renderUsers();
}

function switchNavTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });

  const titles = {
    dashboard: ["Visão geral", "Resumo operacional da empresa selecionada"],
    employees: ["Colaboradores (eSocial)", "Admissões e trabalhadores sem vínculo"],
    payroll: ["Folha de Pagamento", "Cálculo de rubricas e demonstrativos"],
    users: ["Usuários da Empresa", "Controle de acesso por empresa"]
  };
  const [title, sub] = titles[tabName] || ["PulseDP", ""];
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = sub;
}

// EVENTOS DE AUTH
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    setAuthError("");
    const mode = tab.dataset.authTab;
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.getElementById("loginForm").hidden = mode !== "login";
    document.getElementById("registerCompanyForm").hidden = mode !== "register";
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthError("");
  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value
      })
    });
    applySessionData(data);
    showAppScreen();
    await loadCompanyWorkspace();
  } catch (err) {
    setAuthError(err.message);
  }
});

document.getElementById("btnDemoQuickLogin").addEventListener("click", async () => {
  setAuthError("");
  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ demoQuickLogin: true })
    });
    applySessionData(data);
    showAppScreen();
    await loadCompanyWorkspace();
  } catch (err) {
    setAuthError(err.message);
  }
});

document.getElementById("registerCompanyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthError("");
  try {
    const data = await apiFetch("/api/auth/register-company", {
      method: "POST",
      body: JSON.stringify({
        companyType: document.getElementById("regCompanyType").value,
        cnpj: document.getElementById("regCnpj").value,
        companyName: document.getElementById("regCompanyName").value,
        tradeName: document.getElementById("regTradeName").value,
        userName: document.getElementById("regUserName").value,
        email: document.getElementById("regUserEmail").value,
        password: document.getElementById("regUserPassword").value
      })
    });
    applySessionData(data);
    showAppScreen();
    await loadCompanyWorkspace();
  } catch (err) {
    setAuthError(err.message);
  }
});

// DROPDOWN DO SELETOR DE EMPRESA
document.getElementById("companyTrigger").addEventListener("click", (ev) => {
  ev.stopPropagation();
  const dd = document.getElementById("companyDropdown");
  dd.hidden = !dd.hidden;
});

document.addEventListener("click", () => {
  const dd = document.getElementById("companyDropdown");
  if (dd) dd.hidden = true;
});

document.getElementById("btnOpenAddCompany").addEventListener("click", () => {
  document.getElementById("companyDropdown").hidden = true;
  document.getElementById("modalAddCompany").hidden = false;
});

document.getElementById("btnOpenManageCompanies").addEventListener("click", () => {
  document.getElementById("companyDropdown").hidden = true;
  renderManageCompaniesModal();
  document.getElementById("modalManageCompanies").hidden = false;
});

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.closeModal).hidden = true;
  });
});

document.getElementById("addCompanyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const updated = await apiFetch("/api/companies", {
      method: "POST",
      body: JSON.stringify({
        type: document.getElementById("addCompanyType").value,
        name: document.getElementById("addCompanyName").value,
        cnpj: document.getElementById("addCompanyCnpj").value
      })
    });
    applySessionData(updated);
    e.target.reset();
    document.getElementById("modalAddCompany").hidden = true;
    await loadCompanyWorkspace();
  } catch (err) {
    alert(err.message);
  }
});

// NAVEGAÇÃO E FORMULÁRIOS INTERNOS
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchNavTab(btn.dataset.nav));
});

document.getElementById("employeeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await apiFetch("/api/employees", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("empName").value,
        cpf: document.getElementById("empCpf").value,
        role: document.getElementById("empRole").value,
        regime: document.getElementById("empRegime").value,
        baseSalary: document.getElementById("empSalary").value,
        dependents: document.getElementById("empDependents").value,
        admissionDate: document.getElementById("empAdmission").value
      })
    });
    e.target.reset();
    await loadCompanyWorkspace();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("payEmployeeId").addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.salary) {
    document.getElementById("payGross").value = opt.dataset.salary;
  }
});

document.getElementById("payrollForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await apiFetch("/api/payrolls", {
      method: "POST",
      body: JSON.stringify({
        employeeId: document.getElementById("payEmployeeId").value,
        type: document.getElementById("payType").value,
        competence: document.getElementById("payCompetence").value,
        grossSalary: document.getElementById("payGross").value,
        extras: document.getElementById("payExtras").value,
        inss: document.getElementById("payInss").value,
        irrf: document.getElementById("payIrrf").value,
        otherDeductions: document.getElementById("payOther").value
      })
    });
    await loadCompanyWorkspace();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("createUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const res = await apiFetch("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("newUserName").value,
        email: document.getElementById("newUserEmail").value,
        password: document.getElementById("newUserPassword").value,
        role: document.getElementById("newUserRole").value
      })
    });
    const notice = document.getElementById("userCreatedNotice");
    notice.hidden = false;
    notice.textContent = res.generatedPassword
      ? `Usuário ${res.user.email} cadastrado! Senha temporária gerada: ${res.generatedPassword}`
      : `Usuário ${res.user.email} vinculado à empresa ativa com sucesso.`;
    e.target.reset();
    await loadCompanyWorkspace();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btnToggleTheme").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
});

document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  state.companies = [];
  state.activeCompany = null;
  showAuthScreen();
});

// INICIALIZAÇÃO
(async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  if (!state.token) {
    showAuthScreen();
    return;
  }
  try {
    const session = await apiFetch("/api/session");
    applySessionData(session);
    showAppScreen();
    await loadCompanyWorkspace();
  } catch (_) {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    showAuthScreen();
  }
})();
