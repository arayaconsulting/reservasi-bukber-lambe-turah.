(() => {
  "use strict";
  /*
   * CEKER & KERANG PEDAS LAMBE TURAH
   * RESERVATION.JS v1.0 — Reservasi bukber melalui WhatsApp
   * Tanpa backend, tanpa database, tanpa Google Apps Script.
   * Harus dimuat sesudah script katalog dalam index.html v1.0.
   */

  const CONFIG = Object.freeze({
    // Tanggal PERKIRAAN Ramadan 1448 H. Perbarui setelah pengumuman resmi.
    startDate: "2027-02-08",
    endDate: "2027-03-10",
    timezone: "Asia/Jakarta",
    maxParticipants: 999,
    maxTotal: 10000000,
    outlets: {
      pahlawan: { name: "Pahlawan", whatsapp: "6285791655515" },
      mondokan: { name: "Mondokan", whatsapp: "6285855188856" }
    }
  });

  const app = window.LAMBE_RESERVATION_APP;
  const $ = id => document.getElementById(id);
  const required = ["getOutlet", "getDate", "getPeople", "getCart", "getProduct", "getSubtotal", "getPaymentPlan", "getPaymentMethod"];
  if (!app || required.some(key => typeof app[key] !== "function")) {
    console.error("LAMBE_RESERVATION_APP tidak lengkap. Pastikan index.html V1.0 digunakan.");
    return;
  }
  const dateField = $("bookingDate");
  const button = $("checkoutButton");
  if (!dateField || !button || !$("agreeTerms") || !$("customerName") || !$("customerPhone")) {
    console.error("Elemen reservasi wajib tidak ditemukan.");
    return;
  }

  const currency = value => "Rp" + Math.round(value).toLocaleString("id-ID");
  const textClean = (value, max = 400) => String(value ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);

  function normalizePhone(value) {
    let digits = String(value ?? "").replace(/\D/g, "");
    if (digits.startsWith("62")) digits = "0" + digits.slice(2);
    return /^08\d{8,11}$/.test(digits) ? digits : "";
  }

  function todayWIB() {
    // sv-SE menghasilkan YYYY-MM-DD pada zona waktu yang disebutkan.
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  function isValidCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    }).format(new Date(value + "T12:00:00Z"));
  }

  function validDate(value) {
    return isValidCalendarDate(value) && value >= CONFIG.startDate &&
      value <= CONFIG.endDate && value >= todayWIB();
  }

  function refreshCalendar() {
    const today = todayWIB();
    dateField.min = today > CONFIG.startDate ? today : CONFIG.startDate;
    dateField.max = CONFIG.endDate;
    const help = $("dateHelp");
    if (today > CONFIG.endDate) {
      dateField.disabled = true;
      if (help) help.textContent = "Periode reservasi Ramadan yang dikonfigurasi telah berakhir.";
    } else {
      dateField.disabled = false;
      if (help) help.textContent = "Tanggal Ramadan masih perkiraan; admin akan mengonfirmasi jadwal.";
    }
    if (dateField.value && !validDate(dateField.value)) dateField.value = "";
    updateButton();
  }

  const MAIN_FOOD = new Set(["Paket Hemat", "Paket Kenyang", "Menu Satuan", "Menu Mix"]);
  function isFood(product) {
    // Nasi termasuk makanan; kerupuk dan minuman saja tidak cukup.
    return MAIN_FOOD.has(product.category) || product.id === "nasi";
  }

  function validateItems(showAlerts = false) {
    const items = app.getCart();
    if (!Array.isArray(items) || !items.length) return { ok: false, error: "Pilih setidaknya satu menu makanan." };
    const lines = [];
    let amount = 0;
    let foodQty = 0;
    for (const item of items) {
      const product = app.getProduct(item.id);
      const quantity = Number(item.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return {ok:false,error:"Keranjang tidak valid. Periksa jumlah menu dan coba lagi."};
      }
      const price = Number(product.price);
      if (!Number.isSafeInteger(price) || price < 0) {
        return {ok:false,error:"Harga menu tidak valid. Muat ulang halaman."};
      }
      const variant = textClean(item.variant, 100);
      if (MAIN_FOOD.has(product.category) && !variant) {
        return {ok:false,error:"Pilih level kepedasan untuk " + product.name + "."};
      }
      if (["es-teh", "es-jeruk"].includes(product.id) && !["Es", "Panas"].includes(variant)) {
        return {ok:false,error:"Pilih penyajian minuman " + product.name + "."};
      }
      if (isFood(product)) foodQty += quantity;
      const lineTotal = price * quantity;
      amount += lineTotal;
      lines.push({name:textClean(product.name,120),quantity,price,variant,lineTotal,drink:["es-teh","es-jeruk"].includes(product.id)});
    }
    if (!foodQty) return {ok:false,error:"Reservasi harus memesan minimal satu makanan (bukan hanya minuman atau kerupuk)."};
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > CONFIG.maxTotal || amount !== app.getSubtotal()) {
      return {ok:false,error:"Total pesanan tidak valid atau berubah. Periksa keranjang."};
    }
    return {ok:true,lines,total:amount};
  }

  function updateButton() {
    const items = validateItems();
    // Informasi validasi lengkap tetap muncul pada klik; tidak memaksa pengguna
    // mengisi nama/nomor WA sebelum melihat dan menyusun pesanan.
    if (dateField.disabled) {
      button.disabled = true;
      button.textContent = "Periode Reservasi Belum Tersedia";
    } else if (!items.ok) {
      button.disabled = true;
      button.textContent = "Pilih Menu Makanan Terlebih Dahulu";
    } else {
      button.disabled = false;
      button.textContent = "Ajukan Reservasi via WhatsApp";
    }
  }

  function buildOrder() {
    const outlet = CONFIG.outlets[app.getOutlet()];
    if (!outlet) return {error:"Silakan pilih cabang yang tersedia."};
    const date = app.getDate();
    if (!validDate(date)) return {error:"Pilih tanggal bukber yang masih tersedia dalam periode Ramadan." ,focus:dateField};
    const people = Number(app.getPeople());
    if (!Number.isInteger(people) || people < 1 || people > CONFIG.maxParticipants) {
      return {error:"Jumlah peserta tidak valid."};
    }
    const basket = validateItems();
    if (!basket.ok) return {error:basket.error};
    const name = textClean($("customerName").value,100);
    if (name.length < 2) return {error:"Isi nama pemesan minimal 2 karakter.",focus:$("customerName")};
    const phone = normalizePhone($("customerPhone").value);
    if (!phone) return {error:"Isi nomor WhatsApp yang valid (08xxxxxxxxxx).",focus:$("customerPhone")};
    const notes = textClean($("customerNotes")?.value,400) || "-";
    const plan = app.getPaymentPlan();
    const method = app.getPaymentMethod();
    if (!["dp","full"].includes(plan) || !["Cash","QRIS"].includes(method)) {
      return {error:"Pilih cara dan metode pembayaran yang tersedia."};
    }
    if (!$("agreeTerms").checked) {
      return {error:"Centang persetujuan ketentuan reservasi terlebih dahulu.",focus:$("agreeTerms")};
    }
    const due = plan === "dp" ? Math.ceil(basket.total / 2) : basket.total;
    return {outlet,date,people,name,phone,notes,plan,method,due,remaining:basket.total-due,...basket};
  }

  function whatsappText(order) {
    const lines = [
      "Halo Kak, saya ingin mengajukan reservasi bukber di Lambe Turah.","",
      "*PENGAJUAN RESERVASI BUKBER — LAMBE TURAH*",
      "*BELUM TERKONFIRMASI — MENUNGGU ADMIN*", "",
      "*DETAIL RESERVASI*",
      "Cabang: " + order.outlet.name,
      "Tanggal: " + dateLabel(order.date),
      "Jumlah peserta: " + order.people + " orang",
      "Nama pemesan: " + order.name,
      "WhatsApp: " + order.phone,
      "Catatan: " + order.notes,"",
      "*RINCIAN MENU*", "------------------------"
    ];
    order.lines.forEach((item,i) => {
      lines.push((i+1) + ". *" + item.name + "* × " + item.quantity);
      if (item.variant) lines.push("   " + (item.drink ? "Penyajian: " : "Level: ") + item.variant);
      lines.push("   " + currency(item.lineTotal));
    });
    lines.push("", "*PEMBAYARAN YANG DIPILIH*", "------------------------",
      "Total pesanan: " + currency(order.total),
      "Pilihan: " + (order.plan === "dp" ? "DP 50%" : "Lunas 100%"),
      "Nominal awal: " + currency(order.due),
      "Sisa tagihan: " + currency(order.remaining),
      "Metode: " + (order.method === "QRIS" ? "QRIS" : "Tunai di outlet"),"",
      "*CATATAN*",
      "Selama Ramadan, nasi tidak berlaku free refill.",
      "Saya belum melakukan pembayaran dan menunggu konfirmasi ketersediaan tempat dari admin.",
      "Batas pembayaran 30 menit sejak instruksi pembayaran diberikan oleh admin.","",
      "Mohon konfirmasi tempat serta instruksi pembayaran. Terima kasih."
    );
    return lines.join("\n");
  }

  let navigating = false;
  button.addEventListener("click", () => {
    if (navigating) return;
    const order = buildOrder();
    if (order.error) {
      window.alert(order.error);
      order.focus?.focus();
      return;
    }
    const review = [
      "PERIKSA PENGAJUAN RESERVASI", "",
      "Cabang: " + order.outlet.name,
      "Tanggal: " + dateLabel(order.date),
      "Peserta: " + order.people + " orang",
      "Total: " + currency(order.total),
      "Pembayaran: " + (order.plan === "dp" ? "DP 50%" : "Lunas") + " / " + order.method,
      "Nominal awal: " + currency(order.due),"",
      "WhatsApp akan terbuka. Tekan KIRIM di WhatsApp agar pengajuan diterima admin.",
      "Tempat belum otomatis dipesan. Jangan membayar sebelum admin memberi instruksi.","",
      "Lanjutkan?"
    ].join("\n");
    if (!window.confirm(review)) return;
    if (!validDate(app.getDate())) {
      window.alert("Tanggal reservasi perlu diperiksa ulang.");
      refreshCalendar();
      return;
    }
    const url = "https://wa.me/" + order.outlet.whatsapp + "?text=" + encodeURIComponent(whatsappText(order));
    navigating = true;
    button.disabled = true;
    button.textContent = "Membuka WhatsApp...";
    window.location.assign(url);
  });

  document.addEventListener("lambe-cart-updated", updateButton);
  document.addEventListener("lambe-booking-updated", updateButton);
  dateField.addEventListener("change", updateButton);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshCalendar();
  });
  window.addEventListener("pageshow", () => { navigating = false; refreshCalendar(); });
  window.addEventListener("focus", refreshCalendar);
  refreshCalendar();
})();
