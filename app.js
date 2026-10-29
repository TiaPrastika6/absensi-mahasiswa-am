(() => {
  "use strict";

  const config = window.APP_CONFIG;

  const form = document.getElementById("attendanceForm");
  const nameInput = document.getElementById("fullName");
  const studyProgramInput = document.getElementById("studyProgram");
  const sessionInput = document.getElementById("session");
  const photoInput = document.getElementById("photo");
  const checkLocationButton = document.getElementById("checkLocation");
  const submitButton = document.getElementById("submitButton");
  const locationStatus = document.getElementById("locationStatus");
  const formMessage = document.getElementById("formMessage");
  const photoPreview = document.getElementById("photoPreview");
  const previewImage = document.getElementById("previewImage");
  const removePhotoButton = document.getElementById("removePhoto");

  if (!config || !config.SUPABASE_URL ||
      !config.SUPABASE_PUBLISHABLE_KEY) {
    showMessage(
      "Konfigurasi Supabase belum diisi. Periksa file config.js.",
      "error"
    );
    submitButton.disabled = true;
    return;
  }

  let currentLocation = null;
  let previewUrl = null;
  let isSubmitting = false;
  
  // Tampilkan formulir hanya ketika setidaknya satu jadwal terbuka.
  const attendanceCard = document.getElementById("attendanceCard");
  const scheduleClosed = document.getElementById("scheduleClosed");
  const scheduleMessage = document.getElementById("scheduleMessage");
  const attendanceForm = document.getElementById("attendanceForm");
  const successPanel = document.getElementById("successPanel");
  const cardHeading = attendanceCard.querySelector(".card-heading");
  const welcomePanel = document.querySelector(".welcome");
  const helpCards = document.querySelectorAll("main > .help-card");

  let scheduleCache = { weekly: [], special: [] };
  let scheduleLastLoaded = 0;

  function timeToSeconds(value) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : null;
  }

  function getBaliDateParts() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Makassar",
      year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit",
      second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date());
    const get = type => parts.find(item => item.type === type)?.value || "";
    const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      weekday: weekdays[get("weekday")],
      seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second"))
    };
  }

  async function refreshPublicSchedule() {
    const now = Date.now();
    if (now - scheduleLastLoaded < 15000) return;
    scheduleLastLoaded = now;
    try {
      const response = await fetch(`${config.SUPABASE_URL}/functions/v1/attendance-schedule`, {
        method: "GET",
        headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY }
      });
      const result = await response.json();
      if (response.ok && result.success) {
        scheduleCache = { weekly: result.weekly || [], special: result.special || [] };
      }
    } catch (error) {
      console.warn("Jadwal dari server belum dapat dimuat; gunakan fallback jadwal reguler.", error);
    }
  }

  async function updateScheduleVisibility() {
    await refreshPublicSchedule();
    const current = getBaliDateParts();
    const isLocalPreview =
      ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
      new URLSearchParams(window.location.search).get("preview") === "1";

    // Simpan jenis dan sesi agar jadwal khusus dapat menggantikan jam Pulang yang tepat.
    let activeRows = scheduleCache.weekly
      .filter(row => Number(row.weekday) === current.weekday);

    const specialToday = scheduleCache.special.filter(row => row.attendance_date === current.date);
    if (specialToday.length) {
      const replacedSessions = new Set(specialToday.map(row => row.session));
      activeRows = activeRows.filter(row =>
        !(row.attendance_type === "Pulang" && replacedSessions.has(row.session))
      );
      for (const row of specialToday) {
        activeRows.push({
          session: row.session,
          attendance_type: "Pulang",
          start_time: row.start_time,
          end_time: row.end_time
        });
      }
    }

    let windows = activeRows
      .map(row => ({ start: timeToSeconds(row.start_time), end: timeToSeconds(row.end_time) }))
      .filter(row => row.start !== null && row.end !== null);

    // PJKR: Datang sesi Pagi Selasa–Jumat pukul 08.30–09.30 WITA.
    if (current.weekday >= 2 && current.weekday <= 5) {
      windows.push({ start: 8 * 3600 + 30 * 60, end: 9 * 3600 + 30 * 60 });
    }

    // Fallback jika endpoint jadwal belum dapat diakses.
    if (!scheduleCache.weekly.length) {
      windows = [
        { start: 6 * 3600, end: 7 * 3600 },
        { start: 12 * 3600, end: 13 * 3600 },
        { start: 11 * 3600, end: 12 * 3600 },
        { start: 17 * 3600, end: 18 * 3600 }
      ];
      if (current.weekday === 6) {
        windows = [
          { start: 6 * 3600, end: 7 * 3600 },
          { start: 11 * 3600, end: 12 * 3600 },
          { start: 10 * 3600, end: 11 * 3600 },
          { start: 14 * 3600, end: 15 * 3600 }
        ];
      }
      if (current.weekday >= 2 && current.weekday <= 5) {
        windows.push({ start: 8 * 3600 + 30 * 60, end: 9 * 3600 + 30 * 60 });
      }
    }

    const isOpen = isLocalPreview || windows.some(
      window => window.start !== null && window.end !== null &&
        current.seconds >= window.start && current.seconds < window.end
    );

    attendanceCard.hidden = !isOpen;
    scheduleClosed.hidden = isOpen;

    if (!isOpen) {
      scheduleMessage.textContent =
        "Saat ini tidak ada jadwal presensi yang dibuka. Formulir akan tersedia otomatis ketika jadwal berikutnya dimulai. Semua jam menggunakan WITA.";
    }
  }

  updateScheduleVisibility();
  setInterval(updateScheduleVisibility, 15000);

  function showMessage(message, type = "info") {
    formMessage.textContent = message;
    formMessage.className = `message ${type}`;
    formMessage.hidden = false;
    // Popup supaya pesan error mudah terlihat di layar HP.
    if (type === "error") window.alert(message);
  }

  function clearMessage() {
    formMessage.textContent = "";
    formMessage.hidden = true;
    formMessage.className = "message";
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const radians = degrees => degrees * Math.PI / 180;
    const earthRadius = 6371000;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return earthRadius * 2 *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Browser ini tidak mendukung GPS."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        error => {
          const messages = {
            1: "Izin lokasi ditolak. Izinkan akses lokasi pada browser.",
            2: "Lokasi belum tersedia. Coba aktifkan GPS.",
            3: "Pemeriksaan GPS terlalu lama. Silakan coba lagi."
          };

          reject(new Error(
            messages[error.code] || "Gagal membaca lokasi perangkat."
          ));
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }
      );
    });
  }

  async function checkLocation() {
    clearMessage();
    checkLocationButton.disabled = true;
    locationStatus.textContent = "Sedang memeriksa lokasi GPS...";
    document.querySelector(".location-panel").classList.remove("location-verified");

    try {
      const position = await getCurrentLocation();
      const { latitude, longitude, accuracy } = position.coords;

      const distance = distanceMeters(
        latitude,
        longitude,
        config.SCHOOL.LATITUDE,
        config.SCHOOL.LONGITUDE
      );

      if (accuracy > config.SCHOOL.MAX_GPS_ACCURACY_METERS) {
        currentLocation = null;
        checkLocationButton.hidden = false;
        checkLocationButton.textContent = "Periksa Lokasi GPS";
        document.querySelector(".location-panel").classList.remove("location-verified");
        locationStatus.textContent =
          `Akurasi GPS ${Math.round(accuracy)} m. Maksimal 100 m.`;
        showMessage(
          "Akurasi lokasi belum mencukupi. Aktifkan lokasi presisi dan coba lagi.",
          "error"
        );
        return;
      }

      if (distance > config.SCHOOL.RADIUS_METERS) {
        currentLocation = null;
        checkLocationButton.hidden = false;
        checkLocationButton.textContent = "Periksa Lokasi GPS";
        document.querySelector(".location-panel").classList.remove("location-verified");
        locationStatus.textContent =
          `Jarak dari titik sekolah sekitar ${Math.round(distance)} m.`;
        showMessage(
          "Lokasi kamu berada di luar radius absensi 150 meter.",
          "error"
        );
        return;
      }

      currentLocation = {
        latitude,
        longitude,
        accuracy
      };

      locationStatus.textContent =
        `Lokasi terdeteksi. Jarak sekitar ${Math.round(distance)} m, ` +
        `akurasi GPS ${Math.round(accuracy)} m.`;

      const locationPanel = document.querySelector(".location-panel");
      locationPanel.classList.add("location-verified");
      checkLocationButton.textContent = "✓ Lokasi berhasil diperiksa";
      checkLocationButton.classList.add("location-verified-button");
      checkLocationButton.hidden = true;
      showMessage("Lokasi berhasil diperiksa dan memenuhi batas absensi.", "success");
    } catch (error) {
      currentLocation = null;
      checkLocationButton.hidden = false;
      checkLocationButton.textContent = "Periksa Lokasi GPS";
      checkLocationButton.classList.remove("location-verified-button");
      document.querySelector(".location-panel").classList.remove("location-verified");
      locationStatus.textContent = error.message;
      showMessage(error.message, "error");
    } finally {
      checkLocationButton.disabled = false;
    }
  }

  
async function compressPhoto(file) {
  if (!file || file.size === 0) {
    throw new Error("File foto kosong atau tidak valid.");
  }

  const supportedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ];

  const fileName = (file.name || "").toLowerCase();
  const isHeic =
    file.type.toLowerCase().includes("heic") ||
    file.type.toLowerCase().includes("heif") ||
    /\.(heic|heif)$/.test(fileName);

  let inputFile = file;

  // Konversi HEIC/HEIF ke JPEG secara otomatis di browser.
  if (isHeic) {
    if (typeof window.heic2any !== "function") {
      throw new Error(
        "Fitur konversi HEIC belum tersedia. Periksa koneksi internet, " +
        "lalu coba kembali atau pilih foto JPEG."
      );
    }

    try {
      const converted = await window.heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85
      });

      inputFile = Array.isArray(converted)
        ? converted[0]
        : converted;
    } catch (error) {
      console.error("Konversi HEIC gagal:", error);
      throw new Error(
        "Foto HEIC tidak dapat dikonversi. Coba pilih foto lain dari galeri."
      );
    }
  } else if (!supportedTypes.includes(file.type.toLowerCase())) {
    throw new Error(
      "Format foto tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC."
    );
  }

  let bitmap;

  try {
    bitmap = await createImageBitmap(inputFile);
  } catch (error) {
    console.error("Foto tidak dapat dibaca:", error);
    throw new Error(
      "Foto tidak dapat dibaca oleh browser. Coba pilih foto lain."
    );
  }

  try {
    const maxDimension = 1600;
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Browser tidak dapat memproses foto.");
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const targetBytes = config.PHOTO.TARGET_SIZE_BYTES;
    let quality = 0.85;
    let output = null;

    // Turunkan kualitas secara bertahap sampai target ukuran tercapai.
    for (let attempt = 0; attempt < 7; attempt++) {
      output = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });

      if (!output) {
        throw new Error("Gagal membuat foto JPEG.");
      }

      if (
        output.size <= targetBytes ||
        quality <= 0.35
      ) {
        break;
      }

      quality = Math.max(0.35, quality - 0.1);
    }

    if (!output || output.size > config.PHOTO.MAX_SIZE_BYTES) {
      throw new Error(
        "Ukuran foto masih terlalu besar. Silakan pilih foto lain."
      );
    }

    return new File(
      [output],
      `absensi-${Date.now()}.jpg`,
      { type: "image/jpeg" }
    );
  } finally {
    bitmap.close();
  }
}


  function resetPhotoPreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    previewImage.removeAttribute("src");
    photoPreview.hidden = true;
  }

  photoInput.addEventListener("change", () => {
    clearMessage();
    resetPhotoPreview();

    const file = photoInput.files?.[0];
    if (!file) return;

    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    photoPreview.hidden = false;
  });

  removePhotoButton.addEventListener("click", () => {
    photoInput.value = "";
    resetPhotoPreview();
    clearMessage();
  });

  checkLocationButton.addEventListener("click", checkLocation);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();

    if (isSubmitting) return;

    if (!form.reportValidity()) return;

    const fullName = nameInput.value.trim();
    const studyProgram = studyProgramInput.value;
    const session = sessionInput.value;
    const attendanceType = form.querySelector(
      'input[name="attendance_type"]:checked'
    )?.value;
    const photoFile = photoInput.files?.[0];

    if (!["BK", "PBSI", "PBI", "PBB", "PM", "PTI", "PJKR"].includes(studyProgram)) {
      showMessage("Pilih program studi yang tersedia.", "error");
      return;
    }

    if (!attendanceType) {
      showMessage("Pilih jenis absensi Datang atau Pulang.", "error");
      return;
    }

    if (!photoFile) {
      showMessage("Foto absensi wajib dipilih.", "error");
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Memproses absensi...";

    try {
      // Periksa lokasi terbaru pada setiap pengiriman.
      const position = await getCurrentLocation();
      const { latitude, longitude, accuracy } = position.coords;

      const distance = distanceMeters(
        latitude,
        longitude,
        config.SCHOOL.LATITUDE,
        config.SCHOOL.LONGITUDE
      );

      if (accuracy > config.SCHOOL.MAX_GPS_ACCURACY_METERS) {
        throw new Error(
          "Akurasi GPS melebihi 100 meter. Aktifkan lokasi presisi."
        );
      }

      if (distance > config.SCHOOL.RADIUS_METERS) {
        throw new Error("Kamu berada di luar radius absensi 150 meter.");
      }

      currentLocation = { latitude, longitude, accuracy };
      document.querySelector(".location-panel").classList.add("location-verified");
      checkLocationButton.hidden = true;
      checkLocationButton.textContent = "✓ Lokasi berhasil diperiksa";
      checkLocationButton.classList.add("location-verified-button");

      showMessage("Sedang memproses foto...", "info");
      const compressedPhoto = await compressPhoto(photoFile);

      const formData = new FormData();
      formData.append("full_name", fullName);
      formData.append("study_program", studyProgram);
      formData.append("session", session);
      formData.append("attendance_type", attendanceType);
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
      formData.append("accuracy_m", String(accuracy));
      formData.append("photo", compressedPhoto);

      showMessage("Mengirim data absensi ke server...", "info");

      const response = await fetch(
        `${config.SUPABASE_URL}/functions/v1/submit-attendance`,
        {
          method: "POST",
          headers: {
            apikey: config.SUPABASE_PUBLISHABLE_KEY
          },
          body: formData
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Absensi gagal dikirim. Silakan coba lagi."
        );
      }

      // Tampilkan konfirmasi besar agar mahasiswa tidak mengirim absensi dua kali.
      document.getElementById("successTitle").textContent = `Absen ${attendanceType} berhasil tersimpan!`;
      document.getElementById("successName").textContent = fullName;
      document.getElementById("successProgram").textContent = studyProgram;
      document.getElementById("successSession").textContent = session;
      document.getElementById("successType").textContent = attendanceType;
      const recordedAt = result.attendance?.created_at || new Date().toISOString();
      document.getElementById("successTime").textContent = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full", timeStyle: "medium", timeZone: "Asia/Makassar"
      }).format(new Date(recordedAt)) + " WITA";
      clearMessage();
      attendanceForm.hidden = true;
      successPanel.hidden = false;
      attendanceCard.hidden = true;
      scheduleClosed.hidden = true;
      if (welcomePanel) welcomePanel.hidden = true;
      helpCards.forEach(card => { card.hidden = true; });
      document.body.classList.add("attendance-completed");
      successPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      // Bersihkan foto setelah server mengonfirmasi data tersimpan.
      photoInput.value = "";
      resetPhotoPreview();
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Terjadi kesalahan. Silakan coba lagi.";
      if (/GPS|lokasi|radius|meter|Izin lokasi/i.test(errorMessage)) {
        currentLocation = null;
        checkLocationButton.hidden = false;
        checkLocationButton.textContent = "Periksa Lokasi GPS";
        checkLocationButton.classList.remove("location-verified-button");
        document.querySelector(".location-panel").classList.remove("location-verified");
        locationStatus.textContent = errorMessage;
      }
      showMessage(errorMessage, "error");
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Kirim Absensi";
    }
  });
})();
