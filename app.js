const STORAGE_KEY = "market-stock-products";

const state = {
  products: loadProducts(),
  selectedBarcode: "",
  detector: null,
  stream: null,
  scanning: false,
};

const els = {
  barcode: document.querySelector("#barcodeInput"),
  camera: document.querySelector("#camera"),
  category: document.querySelector("#categoryInput"),
  clearForm: document.querySelector("#clearFormBtn"),
  delete: document.querySelector("#deleteBtn"),
  expiry: document.querySelector("#expiryInput"),
  export: document.querySelector("#exportBtn"),
  form: document.querySelector("#productForm"),
  formTitle: document.querySelector("#formTitle"),
  importFile: document.querySelector("#importFile"),
  matchBadge: document.querySelector("#matchBadge"),
  name: document.querySelector("#nameInput"),
  notes: document.querySelector("#notesInput"),
  price: document.querySelector("#priceInput"),
  productCount: document.querySelector("#productCount"),
  productList: document.querySelector("#productList"),
  reorder: document.querySelector("#reorderInput"),
  scanStatus: document.querySelector("#scanStatus"),
  search: document.querySelector("#searchInput"),
  startScan: document.querySelector("#startScanBtn"),
  statusFilter: document.querySelector("#statusFilter"),
  stock: document.querySelector("#stockInput"),
  supplier: document.querySelector("#supplierInput"),
  template: document.querySelector("#productCardTemplate"),
};

function loadProducts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));
}

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

function todayAtMidnight() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const expiry = new Date(`${dateValue}T00:00:00`);
  return Math.ceil((expiry - todayAtMidnight()) / 86400000);
}

function productStatus(product) {
  const expiryDays = daysUntil(product.expiryDate);
  const lowStock = Number(product.stockCount) <= Number(product.reorderLevel || 0);

  if (expiryDays !== null && expiryDays < 0) return "expired";
  if (expiryDays !== null && expiryDays <= 7) return "expiring";
  if (lowStock) return "low";
  return "ok";
}

function statusText(product) {
  const status = productStatus(product);
  if (status === "expired") return "Expired";
  if (status === "expiring") return "Expiring soon";
  if (status === "low") return "Low stock";
  return `${product.stockCount} in stock`;
}

function findProduct(barcode) {
  return state.products.find((product) => product.barcode === barcode);
}

function setStatus(message) {
  els.scanStatus.textContent = message;
}

function clearForm(keepBarcode = false) {
  const barcode = keepBarcode ? els.barcode.value.trim() : "";
  els.form.reset();
  els.barcode.value = barcode;
  state.selectedBarcode = barcode;
  els.delete.hidden = true;
  els.formTitle.textContent = "Add product";
  els.matchBadge.textContent = barcode ? "New barcode" : "Waiting for barcode";
  renderProducts();
}

function fillForm(product) {
  state.selectedBarcode = product.barcode;
  els.barcode.value = product.barcode;
  els.name.value = product.name || "";
  els.category.value = product.category || "";
  els.price.value = product.price || "";
  els.stock.value = product.stockCount ?? "";
  els.reorder.value = product.reorderLevel ?? "";
  els.expiry.value = product.expiryDate || "";
  els.supplier.value = product.supplier || "";
  els.notes.value = product.notes || "";
  els.delete.hidden = false;
  els.formTitle.textContent = "Edit product";
  els.matchBadge.textContent = "Product found";
  renderProducts();
}

function handleBarcode(barcode) {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return;

  els.barcode.value = cleanBarcode;
  const product = findProduct(cleanBarcode);
  if (product) {
    fillForm(product);
    setStatus(`Loaded ${product.name}.`);
  } else {
    clearForm(true);
    setStatus("Barcode is new. Add the product details.");
    els.name.focus();
  }
}

async function startScanner() {
  if (!("BarcodeDetector" in window)) {
    setStatus("Camera barcode scanning is not supported here. Type the barcode instead.");
    els.barcode.focus();
    return;
  }

  try {
    state.detector = state.detector || new BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
    });
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    els.camera.srcObject = state.stream;
    await els.camera.play();
    state.scanning = true;
    els.startScan.disabled = true;
    document.querySelector("#stopScanBtn").disabled = false;
    setStatus("Point the camera at a barcode.");
    scanLoop();
  } catch (error) {
    setStatus("Could not start camera. Check browser permission or type the barcode.");
  }
}

async function scanLoop() {
  if (!state.scanning) return;

  try {
    const barcodes = await state.detector.detect(els.camera);
    if (barcodes.length > 0) {
      const barcode = barcodes[0].rawValue;
      stopScanner();
      handleBarcode(barcode);
      return;
    }
  } catch {
    setStatus("Scanner paused. Try again or enter the barcode manually.");
    stopScanner();
    return;
  }

  requestAnimationFrame(scanLoop);
}

function stopScanner() {
  state.scanning = false;
  els.startScan.disabled = false;
  document.querySelector("#stopScanBtn").disabled = true;
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  els.camera.srcObject = null;
}

function productFromForm() {
  return {
    barcode: els.barcode.value.trim(),
    name: els.name.value.trim(),
    category: els.category.value.trim(),
    price: Number(els.price.value || 0).toFixed(2),
    stockCount: Number.parseInt(els.stock.value || "0", 10),
    reorderLevel: Number.parseInt(els.reorder.value || "0", 10),
    expiryDate: els.expiry.value,
    supplier: els.supplier.value.trim(),
    notes: els.notes.value.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function upsertProduct(product) {
  const index = state.products.findIndex((item) => item.barcode === product.barcode);
  if (index >= 0) {
    state.products[index] = product;
  } else {
    state.products.unshift(product);
  }
  saveProducts();
  fillForm(product);
  setStatus(`Saved ${product.name}.`);
}

function renderProducts() {
  const query = els.search.value.trim().toLowerCase();
  const filter = els.statusFilter.value;
  const products = state.products.filter((product) => {
    const text = `${product.barcode} ${product.name} ${product.category}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const status = productStatus(product);
    const matchesFilter = filter === "all" || status === filter;
    return matchesQuery && matchesFilter;
  });

  els.productList.replaceChildren();
  els.productCount.textContent = `${state.products.length} item${state.products.length === 1 ? "" : "s"}`;

  if (products.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.products.length ? "No products match the current filter." : "Scan a barcode to add your first product.";
    els.productList.append(empty);
    return;
  }

  products.forEach((product) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const status = productStatus(product);
    node.classList.toggle("active", product.barcode === state.selectedBarcode);
    node.querySelector(".card-name").textContent = product.name;
    node.querySelector(".card-meta").textContent = `${product.barcode} · ${product.category || "Uncategorised"}`;
    node.querySelector(".card-price").textContent = money(product.price);
    const stock = node.querySelector(".card-stock");
    stock.textContent = statusText(product);
    stock.classList.toggle("low", status === "low" || status === "expiring");
    stock.classList.toggle("expired", status === "expired");
    node.addEventListener("click", () => fillForm(product));
    els.productList.append(node);
  });
}

function exportProducts() {
  const blob = new Blob([JSON.stringify(state.products, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `market-stock-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importProducts(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error("Invalid file");
      state.products = incoming.filter((item) => item && item.barcode && item.name);
      saveProducts();
      clearForm();
      setStatus(`Imported ${state.products.length} products.`);
    } catch {
      setStatus("Import failed. Choose a valid product export JSON file.");
    }
  });
  reader.readAsText(file);
}

els.barcode.addEventListener("change", () => handleBarcode(els.barcode.value));
els.barcode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleBarcode(els.barcode.value);
  }
});
els.clearForm.addEventListener("click", () => clearForm());
els.delete.addEventListener("click", () => {
  const barcode = els.barcode.value.trim();
  state.products = state.products.filter((product) => product.barcode !== barcode);
  saveProducts();
  clearForm();
  setStatus("Product deleted.");
});
els.export.addEventListener("click", exportProducts);
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = productFromForm();
  if (!product.barcode) {
    setStatus("Enter or scan a barcode before saving.");
    els.barcode.focus();
    return;
  }
  upsertProduct(product);
});
els.importFile.addEventListener("change", (event) => importProducts(event.target.files[0]));
els.search.addEventListener("input", renderProducts);
els.startScan.addEventListener("click", startScanner);
els.statusFilter.addEventListener("change", renderProducts);
document.querySelector("#stopScanBtn").addEventListener("click", stopScanner);

clearForm();
renderProducts();
