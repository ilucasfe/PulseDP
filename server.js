require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "pulsedp-dev-secret-change-me";
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.DB_NAME || "pulsedp";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const memoryStore = {
  companies: [],
  users: [],
  employees: [],
  payrolls: []
};

let dbInstance = null;
let mongoClientPromise = null;

function makeInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "EM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toId(val) {
  return String(val);
}

async function seedDemoData(adapter) {
  const existingDemo = await adapter.findOne("companies", { isDemo: true });
  if (existingDemo) return existingDemo;

  const demoCompanyId = new ObjectId().toString();
  const demoUserId = new ObjectId().toString();
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const demoCompany = {
    _id: demoCompanyId,
    name: "DeepNerd Tecnologia",
    tradeName: "DeepNerd",
    initials: "DT",
    cnpj: "74.849.398/0001-71",
    type: "company",
    environment: "demo",
    isDemo: true,
    status: "active",
    createdAt: new Date().toISOString()
  };

  const demoUser = {
    _id: demoUserId,
    name: "Administrador Demo",
    email: "demo@pulsedp.local",
    passwordHash,
    activeCompanyId: demoCompanyId,
    memberships: [
      {
        companyId: demoCompanyId,
        role: "admin",
        active: true
      }
    ],
    createdAt: new Date().toISOString()
  };

  const demoEmployees = [
    {
      _id: new ObjectId().toString(),
      companyId: demoCompanyId,
      environment: "demo",
      name: "Mariana Costa Silva",
      cpf: "123.456.789-01",
      role: "Analista de Folha Sênior",
      regime: "com_vinculo",
      esocialLayout: "S-2200 (evtAdmissao)",
      admissionDate: "2024-03-10",
      baseSalary: 4850.0,
      dependents: 1,
      status: "ativo",
      createdAt: new Date().toISOString()
    },
    {
      _id: new ObjectId().toString(),
      companyId: demoCompanyId,
      environment: "demo",
      name: "Rafael Almeida Souza",
      cpf: "234.567.890-12",
      role: "Desenvolvedor Frontend",
      regime: "com_vinculo",
      esocialLayout: "S-2200 (evtAdmissao)",
      admissionDate: "2025-01-15",
      baseSalary: 6200.0,
      dependents: 0,
      status: "ativo",
      createdAt: new Date().toISOString()
    },
    {
      _id: new ObjectId().toString(),
      companyId: demoCompanyId,
      environment: "demo",
      name: "Camila Ferreira Lima",
      cpf: "345.678.901-23",
      role: "Consultora Contábil (TSV)",
      regime: "sem_vinculo",
      esocialLayout: "S-2300 (evtTSVInicio)",
      admissionDate: "2025-06-01",
      baseSalary: 3900.0,
      dependents: 0,
      status: "ferias",
      createdAt: new Date().toISOString()
    }
  ];

  const demoPayrolls = [
    {
      _id: new ObjectId().toString(),
      companyId: demoCompanyId,
      environment: "demo",
      employeeId: demoEmployees[0]._id,
      employeeName: demoEmployees[0].name,
      employeeCpf: demoEmployees[0].cpf,
      type: "mensal",
      competence: "2026-11",
      grossSalary: 4850.0,
      extras: 350.0,
      inss: 546.82,
      irrf: 298.45,
      otherDeductions: 120.0,
      fgts: 416.0,
      netSalary: 4234.73,
      createdAt: new Date().toISOString()
    }
  ];

  await adapter.insertOne("companies", demoCompany);
  await adapter.insertOne("users", demoUser);
  for (const emp of demoEmployees) await adapter.insertOne("employees", emp);
  for (const pay of demoPayrolls) await adapter.insertOne("payrolls", pay);

  return demoCompany;
}

function createDbAdapter() {
  return {
    async find(col, filter = {}) {
      if (dbInstance) {
        return dbInstance.collection(col).find(filter).toArray();
      }
      return memoryStore[col].filter((doc) =>
        Object.entries(filter).every(([k, v]) => {
          if (v && typeof v === "object" && "$in" in v) {
            return v.$in.includes(doc[k]);
          }
          return doc[k] === v;
        })
      );
    },
    async findOne(col, filter = {}) {
      const items = await this.find(col, filter);
      return items[0] || null;
    },
    async insertOne(col, doc) {
      const normalized = { ...doc, _id: toId(doc._id || new ObjectId()) };
      if (dbInstance) {
        await dbInstance.collection(col).insertOne(normalized);
        return normalized;
      }
      memoryStore[col].push(normalized);
      return normalized;
    },
    async updateOne(col, filter, updateDoc) {
      if (dbInstance) {
        return dbInstance.collection(col).updateOne(filter, updateDoc);
      }
      const list = memoryStore[col];
      for (let i = 0; i < list.length; i++) {
        const match = Object.entries(filter).every(([k, v]) => list[i][k] === v);
        if (match) {
          if (updateDoc.$set) {
            list[i] = { ...list[i], ...updateDoc.$set };
          }
        }
      }
    }
  };
}

const db = createDbAdapter();

async function initDatabase() {
  if (MONGODB_URI) {
    if (!dbInstance) {
      if (!mongoClientPromise) {
        const client = new MongoClient(MONGODB_URI);
        mongoClientPromise = client.connect().then((connectedClient) => {
          dbInstance = connectedClient.db(DB_NAME);
          console.log("Conectado ao MongoDB Atlas:", DB_NAME);
          return dbInstance;
        });
      }
      await mongoClientPromise;
    }
  } else {
    console.log("MONGODB_URI não definida: usando armazenamento em memória local.");
  }
  await seedDemoData(db);
}

function signToken(userId) {
  return jwt.sign({ sub: toId(userId) }, JWT_SECRET, { expiresIn: "7d" });
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Token de autenticação ausente." });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.findOne("users", { _id: toId(payload.sub) });
    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

async function getUserContext(user) {
  const activeMemberships = (user.memberships || []).filter((m) => m.active !== false);
  const companyIds = activeMemberships.map((m) => toId(m.companyId));
  const allCompanies = companyIds.length
    ? await db.find("companies", { _id: { $in: companyIds } })
    : [];

  const companies = allCompanies.map((c) => {
    const membership = activeMemberships.find((m) => toId(m.companyId) === toId(c._id));
    return {
      ...c,
      role: membership ? membership.role : "consulta"
    };
  });

  let activeCompany =
    companies.find((c) => toId(c._id) === toId(user.activeCompanyId)) || companies[0] || null;

  if (activeCompany && toId(activeCompany._id) !== toId(user.activeCompanyId)) {
    await db.updateOne(
      "users",
      { _id: toId(user._id) },
      { $set: { activeCompanyId: toId(activeCompany._id) } }
    );
  }

  const activeMembership = activeCompany
    ? activeMemberships.find((m) => toId(m.companyId) === toId(activeCompany._id))
    : null;

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: activeMembership ? activeMembership.role : "consulta"
    },
    companies,
    activeCompany
  };
}

app.post("/api/auth/register-company", async (req, res) => {
  try {
    const {
      companyName,
      tradeName,
      cnpj,
      companyType,
      userName,
      email,
      password
    } = req.body || {};

    if (!companyName || !userName || !email || !password) {
      return res.status(400).json({
        error: "Preencha nome do escritório/empresa, nome do usuário, e-mail e senha."
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await db.findOne("users", { email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        error: "Já existe um usuário cadastrado com este e-mail. Faça login para adicionar empresas."
      });
    }

    const companyId = new ObjectId().toString();
    const userId = new ObjectId().toString();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const newCompany = {
      _id: companyId,
      name: String(companyName).trim(),
      tradeName: String(tradeName || companyName).trim(),
      initials: makeInitials(companyName),
      cnpj: String(cnpj || "").trim(),
      type: companyType === "office" ? "office" : "company",
      environment: "production",
      isDemo: false,
      status: "active",
      createdAt: new Date().toISOString(),
      createdByUserId: userId
    };

    const newUser = {
      _id: userId,
      name: String(userName).trim(),
      email: normalizedEmail,
      passwordHash,
      activeCompanyId: companyId,
      memberships: [{ companyId, role: "admin", active: true }],
      createdAt: new Date().toISOString()
    };

    await db.insertOne("companies", newCompany);
    await db.insertOne("users", newUser);

    const token = signToken(userId);
    const ctx = await getUserContext(newUser);
    return res.status(201).json({ token, ...ctx });
  } catch (err) {
    console.error("Erro ao cadastrar empresa e usuário:", err);
    return res.status(500).json({ error: "Erro interno ao cadastrar escritório/empresa." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, demoQuickLogin } = req.body || {};
    await seedDemoData(db);

    if (demoQuickLogin) {
      const demoUser = await db.findOne("users", { email: "demo@pulsedp.local" });
      const demoCompany = await db.findOne("companies", { isDemo: true });
      if (demoUser && demoCompany) {
        await db.updateOne(
          "users",
          { _id: toId(demoUser._id) },
          { $set: { activeCompanyId: toId(demoCompany._id) } }
        );
        demoUser.activeCompanyId = toId(demoCompany._id);
        const token = signToken(demoUser._id);
        const ctx = await getUserContext(demoUser);
        return res.json({ token, ...ctx });
      }
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Informe e-mail e senha." });
    }

    const user = await db.findOne("users", { email: String(email).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const validPassword = await bcrypt.compare(String(password), user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = signToken(user._id);
    const ctx = await getUserContext(user);
    return res.json({ token, ...ctx });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: "Erro ao autenticar." });
  }
});

app.get("/api/session", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  return res.json(ctx);
});

app.get("/api/companies", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  return res.json({
    companies: ctx.companies,
    activeCompanyId: ctx.activeCompany ? ctx.activeCompany._id : null
  });
});

app.post("/api/companies", authMiddleware, async (req, res) => {
  try {
    const { name, tradeName, cnpj, type } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "Informe o nome ou razão social da empresa." });
    }

    const companyId = new ObjectId().toString();
    const newCompany = {
      _id: companyId,
      name: String(name).trim(),
      tradeName: String(tradeName || name).trim(),
      initials: makeInitials(name),
      cnpj: String(cnpj || "").trim(),
      type: type === "office" ? "office" : "company",
      environment: "production",
      isDemo: false,
      status: "active",
      createdAt: new Date().toISOString(),
      createdByUserId: toId(req.user._id)
    };

    await db.insertOne("companies", newCompany);

    const updatedMemberships = [
      ...(req.user.memberships || []),
      { companyId, role: "admin", active: true }
    ];

    await db.updateOne(
      "users",
      { _id: toId(req.user._id) },
      { $set: { memberships: updatedMemberships, activeCompanyId: companyId } }
    );

    req.user.memberships = updatedMemberships;
    req.user.activeCompanyId = companyId;

    const ctx = await getUserContext(req.user);
    return res.status(201).json({ company: newCompany, ...ctx });
  } catch (err) {
    console.error("Erro ao adicionar empresa:", err);
    return res.status(500).json({ error: "Erro ao criar nova empresa." });
  }
});

app.post("/api/companies/switch", authMiddleware, async (req, res) => {
  try {
    const { companyId } = req.body || {};
    const targetId = toId(companyId);

    const hasAccess = (req.user.memberships || []).some(
      (m) => toId(m.companyId) === targetId && m.active !== false
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Usuário não possui vínculo com a empresa selecionada." });
    }

    await db.updateOne(
      "users",
      { _id: toId(req.user._id) },
      { $set: { activeCompanyId: targetId } }
    );
    req.user.activeCompanyId = targetId;

    const ctx = await getUserContext(req.user);
    return res.json(ctx);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao alternar empresa." });
  }
});

app.get("/api/users", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  if (!ctx.activeCompany) {
    return res.status(400).json({ error: "Nenhuma empresa ativa selecionada." });
  }

  const activeCompanyId = toId(ctx.activeCompany._id);
  const allUsers = await db.find("users", {});

  const companyUsers = allUsers
    .map((u) => {
      const m = (u.memberships || []).find((item) => toId(item.companyId) === activeCompanyId);
      if (!m) return null;
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: m.role,
        active: m.active !== false
      };
    })
    .filter(Boolean);

  return res.json({ users: companyUsers });
});

app.post("/api/users", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user);
    if (!ctx.activeCompany) {
      return res.status(400).json({ error: "Nenhuma empresa ativa selecionada." });
    }
    if (ctx.user.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem cadastrar novos usuários." });
    }

    const { name, email, password, role } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "Informe nome e e-mail do novo usuário." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const safeRole = ["admin", "analista_dp", "consulta"].includes(role) ? role : "analista_dp";
    const companyId = toId(ctx.activeCompany._id);

    let existingUser = await db.findOne("users", { email: normalizedEmail });

    if (existingUser) {
      const alreadyLinked = (existingUser.memberships || []).some(
        (m) => toId(m.companyId) === companyId
      );
      if (alreadyLinked) {
        return res.status(409).json({ error: "Este usuário já está vinculado à empresa ativa." });
      }
      const nextMemberships = [
        ...(existingUser.memberships || []),
        { companyId, role: safeRole, active: true }
      ];
      await db.updateOne(
        "users",
        { _id: toId(existingUser._id) },
        { $set: { memberships: nextMemberships } }
      );
      return res.status(201).json({
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: safeRole,
          active: true
        }
      });
    }

    const rawPassword =
      password && String(password).length >= 6
        ? String(password)
        : crypto.randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const newUser = {
      _id: new ObjectId().toString(),
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      activeCompanyId: companyId,
      memberships: [{ companyId, role: safeRole, active: true }],
      createdAt: new Date().toISOString()
    };

    await db.insertOne("users", newUser);

    return res.status(201).json({
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: safeRole,
        active: true
      },
      generatedPassword: password && String(password).length >= 6 ? undefined : rawPassword
    });
  } catch (err) {
    console.error("Erro ao cadastrar novo usuário:", err);
    return res.status(500).json({ error: "Erro ao cadastrar usuário." });
  }
});

app.patch("/api/users/:userId", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user);
    if (!ctx.activeCompany || ctx.user.role !== "admin") {
      return res.status(403).json({ error: "Sem permissão para alterar usuários." });
    }

    const companyId = toId(ctx.activeCompany._id);
    const targetUser = await db.findOne("users", { _id: toId(req.params.userId) });
    if (!targetUser) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const { role, active } = req.body || {};
    const updatedMemberships = (targetUser.memberships || []).map((m) => {
      if (toId(m.companyId) !== companyId) return m;
      return {
        ...m,
        role: role && ["admin", "analista_dp", "consulta"].includes(role) ? role : m.role,
        active: typeof active === "boolean" ? active : m.active
      };
    });

    await db.updateOne(
      "users",
      { _id: toId(targetUser._id) },
      { $set: { memberships: updatedMemberships } }
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

app.get("/api/employees", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  if (!ctx.activeCompany) return res.json({ employees: [] });

  const employees = await db.find("employees", {
    companyId: toId(ctx.activeCompany._id),
    environment: ctx.activeCompany.environment
  });
  return res.json({ employees });
});

app.post("/api/employees", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  if (!ctx.activeCompany) {
    return res.status(400).json({ error: "Selecione uma empresa ativa." });
  }

  const { name, cpf, role, regime, admissionDate, baseSalary, dependents, status } = req.body || {};
  if (!name || !cpf || !baseSalary) {
    return res.status(400).json({ error: "Preencha nome, CPF e salário base." });
  }

  const safeRegime = regime === "sem_vinculo" ? "sem_vinculo" : "com_vinculo";
  const emp = {
    _id: new ObjectId().toString(),
    companyId: toId(ctx.activeCompany._id),
    environment: ctx.activeCompany.environment,
    name: String(name).trim(),
    cpf: String(cpf).trim(),
    role: String(role || "Colaborador").trim(),
    regime: safeRegime,
    esocialLayout:
      safeRegime === "com_vinculo" ? "S-2200 (evtAdmissao)" : "S-2300 (evtTSVInicio)",
    admissionDate: admissionDate || new Date().toISOString().slice(0, 10),
    baseSalary: Number(baseSalary) || 0,
    dependents: Number(dependents) || 0,
    status: ["ativo", "ferias", "afastado", "desligado"].includes(status) ? status : "ativo",
    createdAt: new Date().toISOString()
  };

  await db.insertOne("employees", emp);
  return res.status(201).json({ employee: emp });
});

app.get("/api/payrolls", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  if (!ctx.activeCompany) return res.json({ payrolls: [] });

  const payrolls = await db.find("payrolls", {
    companyId: toId(ctx.activeCompany._id),
    environment: ctx.activeCompany.environment
  });
  return res.json({ payrolls });
});

app.post("/api/payrolls", authMiddleware, async (req, res) => {
  const ctx = await getUserContext(req.user);
  if (!ctx.activeCompany) {
    return res.status(400).json({ error: "Selecione uma empresa ativa." });
  }

  const { employeeId, type, competence, grossSalary, extras, inss, irrf, otherDeductions } =
    req.body || {};

  const emp = await db.findOne("employees", {
    _id: toId(employeeId),
    companyId: toId(ctx.activeCompany._id)
  });

  if (!emp) {
    return res.status(404).json({ error: "Colaborador não encontrado na empresa ativa." });
  }

  const gross = Number(grossSalary ?? emp.baseSalary) || 0;
  const add = Number(extras) || 0;
  const inssVal = Number(inss) || 0;
  const irrfVal = Number(irrf) || 0;
  const otherVal = Number(otherDeductions) || 0;

  const totalProventos = gross + add;
  const totalDescontos = inssVal + irrfVal + otherVal;
  const netSalary = Number((totalProventos - totalDescontos).toFixed(2));
  const fgts = Number((totalProventos * 0.08).toFixed(2));

  const record = {
    _id: new ObjectId().toString(),
    companyId: toId(ctx.activeCompany._id),
    environment: ctx.activeCompany.environment,
    employeeId: emp._id,
    employeeName: emp.name,
    employeeCpf: emp.cpf,
    type: ["mensal", "ferias", "decimo_terceiro", "rescisao"].includes(type) ? type : "mensal",
    competence: competence || new Date().toISOString().slice(0, 7),
    grossSalary: gross,
    extras: add,
    inss: inssVal,
    irrf: irrfVal,
    otherDeductions: otherVal,
    fgts,
    netSalary,
    createdAt: new Date().toISOString()
  };

  await db.insertOne("payrolls", record);
  return res.status(201).json({ payroll: record });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function createApp() {
  return app;
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`PulseDP rodando em http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Falha ao inicializar banco:", err);
      process.exit(1);
    });
}

module.exports = { app, createApp, initDatabase };
