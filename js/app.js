const KCAL_OPTIONS = [
  [1200, "1200 ккал"],
  [1500, "1500 ккал"],
  [1800, "1800 ккал"],
  [2000, "2000 ккал"],
];

const MENU_OPTIONS = [
  ["home", "Домашнее меню"],
  ["office", "Офисное меню"],
  ["city_snack", "Перекус в городе"],
];

const MEAL_LABELS = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Перекус",
  dinner: "Ужин",
};

const MACRO_KEYS = ["protein_g", "fat_g", "carbs_g", "fiber_g"];

const INDICATOR_COLORS = {
  green: "#2e7d32",
  yellow: "#f9a825",
  red: "#c62828",
};

const MENU_DISCLAIMER =
  "Значения — демонстрационные усреднённые оценки по типовым блюдам.\n\n" +
  "Нормы потребления микро- и макронутриентов — Методические рекомендации " +
  "MP 2.3.1.0253-21 «Нормы физиологических потребностей в энергии и пищевых " +
  "веществах для различных групп населения Российской Федерации» " +
  "(утв. Федеральной службой по надзору в сфере защиты прав потребителей " +
  "и благополучия человека 22 июля 2021 г.).";

const state = {
  gender: "female",
  kcal: null,
  mealType: null,
  showMenu: false,
  optifastEnabled: false,
};

let menuData = null;
let optifastData = null;
let microKeys = [];

function findScenario(kcal, mealType) {
  return menuData.scenarios.find(
    (scenario) => scenario.kcal === kcal && scenario.meal_type === mealType
  );
}

function getNorm(entry, gender) {
  return Number(entry[`norm_${gender}`] || 0);
}

function getPercent(entry, gender) {
  return Number(entry[`${gender}_percent`] || 0);
}

function indicatorFromPercent(percent) {
  if (percent >= 90) return "green";
  if (percent >= 60) return "yellow";
  return "red";
}

function getIndicator(entry, gender) {
  return indicatorFromPercent(getPercent(entry, gender));
}

function scaleOptifastNutrients(perSachet, count) {
  if (count <= 0) return {};
  return Object.fromEntries(
    Object.entries(perSachet).map(([key, value]) => [key, value * count])
  );
}

function resolveNutrientDisplay(entry, nutrientKey, gender, supplement) {
  const baseActual = Number(entry.actual || 0);
  const norm = Number(entry[`norm_${gender}`] || 0);

  if (!supplement || Object.keys(supplement).length === 0) {
    return {
      actual: baseActual,
      percent: getPercent(entry, gender),
      indicator: getIndicator(entry, gender),
    };
  }

  const actual = baseActual + Number(supplement[nutrientKey] || 0);
  const percent = norm > 0 ? Math.round((actual / norm) * 100) : 0;
  return {
    actual,
    percent,
    indicator: indicatorFromPercent(percent),
  };
}

function formatUnit(key) {
  if (key.endsWith("_g")) return "г";
  if (key.endsWith("_mg")) return "мг";
  if (key.endsWith("_mcg")) return "мкг";
  return "";
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function allSelected() {
  return state.kcal !== null && state.mealType !== null;
}

function hideResults() {
  state.showMenu = false;
}

function buildNutrientRows(scenario, gender, nutrientKeys, supplement = {}) {
  return nutrientKeys
    .map((key) => {
      const entry = scenario.deficits[key];
      if (!entry) return "";

      const { actual, percent, indicator } = resolveNutrientDisplay(
        entry,
        key,
        gender,
        supplement
      );
      const cappedPercent = Math.min(percent, 150);
      const barWidth = Math.min(cappedPercent, 100);
      const color = INDICATOR_COLORS[indicator] || INDICATOR_COLORS.green;
      const unit = formatUnit(key);
      const norm = getNorm(entry, gender);

      return `
        <div class="nutrient-row">
          <span class="nutrient-name">${entry.label}</span>
          <span class="nutrient-value">${formatNumber(actual)} ${unit} · ${cappedPercent}%</span>
          <div class="nutrient-bar-wrap">
            <div class="nutrient-bar" style="width:${barWidth}%;background:${color};"></div>
          </div>
        </div>
        <div class="nutrient-norm">норма: ${formatNumber(norm)} ${unit}</div>
      `;
    })
    .join("");
}

function buildNutrientsPanel(scenario, gender, supplement) {
  const macroRows = buildNutrientRows(scenario, gender, MACRO_KEYS, supplement);
  const microRows = buildNutrientRows(scenario, gender, microKeys, supplement);

  return `
    <div class="nutrients-panel">
      <h4>Макронутриенты</h4>
      ${macroRows}
      <h4>Микронутриенты</h4>
      ${microRows}
    </div>
  `;
}

function buildMenuCards(scenario) {
  return Object.entries(MEAL_LABELS)
    .map(([mealKey, title]) => {
      const items = scenario.meals[mealKey] || [];
      if (!items.length) return "";
      const listItems = items.map((item) => `<li>${item}</li>`).join("");
      return `
        <div class="menu-card">
          <h4>${title}</h4>
          <ul>${listItems}</ul>
        </div>
      `;
    })
    .join("");
}

function updateChoiceButtons(groupId, selectedValue, stateKey) {
  document.querySelectorAll(`#${groupId} .btn-choice`).forEach((button) => {
    const isSelected = String(button.dataset.value) === String(selectedValue);
    button.classList.toggle("selected", isSelected);
  });
}

function updateControls() {
  const showBtn = document.getElementById("show-menu-btn");
  const hint = document.getElementById("selection-hint");

  showBtn.disabled = !allSelected();
  hint.classList.toggle("hidden", allSelected());

  updateChoiceButtons("kcal-group", state.kcal, "kcal");
  updateChoiceButtons("meal-type-group", state.mealType, "mealType");
}

function updateOptifastLabels() {
  document.getElementById("label-diet").classList.toggle("active", !state.optifastEnabled);
  document.getElementById("label-optifast").classList.toggle("active", state.optifastEnabled);
  document.getElementById("optifast-toggle").checked = state.optifastEnabled;
}

function renderResults() {
  const results = document.getElementById("results");
  if (!state.showMenu || !allSelected()) {
    results.classList.add("hidden");
    return;
  }

  const scenario = findScenario(state.kcal, state.mealType);
  if (!scenario) {
    results.classList.add("hidden");
    return;
  }

  results.classList.remove("hidden");

  const genderLabel = state.gender === "female" ? "женщина" : "мужчина";
  const menuLabel =
    MENU_OPTIONS.find(([value]) => value === state.mealType)?.[1] || "";
  const sachetCount = state.optifastEnabled ? 1 : 0;

  let pills = `
    <span class="summary-pill">${state.kcal} ккал</span>
    <span class="summary-pill">${menuLabel}</span>
    <span class="summary-pill">${genderLabel}</span>
  `;
  if (sachetCount > 0) {
    pills += `<span class="summary-pill">+${sachetCount} саше OPTIFAST</span>`;
  }
  document.getElementById("summary-pills").innerHTML = pills;

  document.getElementById("menu-title").textContent = scenario.title;
  document.getElementById("menu-cards").innerHTML = buildMenuCards(scenario);
  document.getElementById("menu-disclaimer").innerHTML = MENU_DISCLAIMER.replace(
    /\n\n/g,
    "<br><br>"
  );

  updateOptifastLabels();

  const supplement = scaleOptifastNutrients(
    optifastData.nutrients || {},
    sachetCount
  );
  document.getElementById("nutrients-panel").innerHTML = buildNutrientsPanel(
    scenario,
    state.gender,
    supplement
  );

  const logic = menuData.meta.indicator_logic || {};
  document.getElementById("indicator-legend").textContent =
    `🟢 ${logic.green || "поступление ≥ 90% от нормы"} · ` +
    `🟡 ${logic.yellow || "поступление 60–89% от нормы"} · ` +
    `🔴 ${logic.red || "поступление < 60% от нормы"}`;
}

function createChoiceButtons(containerId, options, stateKey) {
  const container = document.getElementById(containerId);
  container.classList.toggle("cols-3", options.length === 3);

  container.innerHTML = options
    .map(
      ([value, label]) => `
        <button
          type="button"
          class="btn btn-choice"
          data-value="${value}"
          data-state-key="${stateKey}"
        >${label}</button>
      `
    )
    .join("");

  container.addEventListener("click", (event) => {
    const button = event.target.closest(".btn-choice");
    if (!button) return;

    const key = button.dataset.stateKey;
    const rawValue = button.dataset.value;
    state[key] = key === "kcal" ? Number(rawValue) : rawValue;
    hideResults();
    updateControls();
    renderResults();
  });
}

function bindEvents() {
  document.querySelectorAll('input[name="gender"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      state.gender = event.target.value;
      hideResults();
      renderResults();
    });
  });

  document.getElementById("show-menu-btn").addEventListener("click", () => {
    if (!allSelected()) return;
    state.showMenu = true;
    renderResults();
  });

  document.getElementById("optifast-toggle").addEventListener("change", (event) => {
    state.optifastEnabled = event.target.checked;
    updateOptifastLabels();
    renderResults();
  });
}

async function loadData() {
  const [menuResponse, optifastResponse] = await Promise.all([
    fetch("data/menu_optimized.json"),
    fetch("data/Optifast.json"),
  ]);

  if (!menuResponse.ok || !optifastResponse.ok) {
    throw new Error("Не удалось загрузить файлы данных.");
  }

  menuData = await menuResponse.json();
  optifastData = await optifastResponse.json();
  microKeys = Object.keys(menuData.meta.nutrient_labels).filter(
    (key) => !MACRO_KEYS.includes(key)
  );
}

function initApp() {
  createChoiceButtons("kcal-group", KCAL_OPTIONS, "kcal");
  createChoiceButtons("meal-type-group", MENU_OPTIONS, "mealType");
  bindEvents();
  updateControls();
  renderResults();
}

async function bootstrap() {
  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("load-error");
  const content = document.getElementById("app-content");

  try {
    await loadData();
    loading.classList.add("hidden");
    content.classList.remove("hidden");
    initApp();
  } catch (error) {
    loading.classList.add("hidden");
    errorBox.textContent = error.message || "Ошибка загрузки приложения.";
    errorBox.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
