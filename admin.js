(() => {
  "use strict";

  const config = window.APP_CONFIG;

  const loginPanel = document.getElementById("loginPanel");
  const dashboardPanel = document.getElementById("dashboardPanel");
  const correctionPanel = document.getElementById("correctionPanel");
  const openCorrectionButton = document.getElementById("openCorrectionButton");
  const backToRecapButton = document.getElementById("backToRecapButton");
  const cancelCorrectionButton = document.getElementById("cancelCorrectionButton");
  const correctionForm = document.getElementById("correctionForm");
  const correctionMessage = document.getElementById("correctionMessage");
  const correctionName = document.getElementById("correctionName");
  const correctionProgram = document.getElementById("correctionProgram");
  const correctionDate = document.getElementById("correctionDate");
  const correctionSession = document.getElementById("correctionSession");
  const correctionReason = document.getElementById("correctionReason");
  const correctionButton = document.getElementById("correctionButton");
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const loginMessage = document.getElementById("loginMessage");
  const dashboardMessage = document.getElementById("dashboardMessage");
  const filterName = document.getElementById("filterName");
  const filterDate = document.getElementById("filterDate");
  const filterSession = document.getElementById("filterSession");
  const filterType = document.getElementById("filterType");
  const filterProgram = document.getElementById("filterProgram");
  const loadButton = document.getElementById("loadButton");
  const exportButton = document.getElementById("exportButton");
  const attendanceRows = document.getElementById("attendanceRows");
  const summary = document.getElementById("summary");
  const schedulePanel = document.getElementById("schedulePanel");
  const openScheduleButton = document.getElementById("openScheduleButton");
  const backFromScheduleButton = document.getElementById("backFromScheduleButton");
  const scheduleMessage = document.getElementById("scheduleMessage");
  const weeklyScheduleForm = document.getElementById("weeklyScheduleForm");
  const weeklyDay = document.getElementById("weeklyDay");
  const specialScheduleForm = document.getElementById("specialScheduleForm");
  const specialDate = document.getElementById("specialDate");
  const specialSession = document.getElementById("specialSession");
  const specialAttendanceType = document.getElementById("specialAttendanceType");
  const specialStart = document.getElementById("specialStart");
  const specialEnd = document.getElementById("specialEnd");
  const specialReason = document.getElementById("specialReason");
  const specialScheduleRows = document.getElementById("specialScheduleRows");

  let supabase = null;
  let currentRecords = [];
  let busy = false;

  function showMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `admin-message ${type}`.trim();
    element.classList.remove("hidden");
  }

  function hideMessage(element) {
    element.textContent = "";
    element.className = "admin-message hidden";
  }

  function setLoggedIn(isLoggedIn) {
    loginPanel.classList.toggle("hidden", isLoggedIn);
    dashboardPanel.classList.toggle("hidden", !isLoggedIn);
    if (!isLoggedIn) {
      correctionPanel.classList.add("hidden");
      schedulePanel?.classList.add("hidden");
    }
  }

  function showRecap() {
    correctionPanel.classList.add("hidden");
    schedulePanel?.classList.add("hidden");
    dashboardPanel.classList.remove("hidden");
  }

  function showSchedule() {
    hideMessage(dashboardMessage);
    hideMessage(scheduleMessage);
    dashboardPanel.classList.add("hidden");
    correctionPanel.classList.add("hidden");
    schedulePanel.classList.remove("hidden");
    loadScheduleSettings();
  }

  function showCorrection() {
    hideMessage(dashboardMessage);
    hideMessage(correctionMessage);
    dashboardPanel.classList.add("hidden");
    correctionPanel.classList.remove("hidden");
  }

  function setBusy(value) {
    busy = value;
    loadButton.disabled = value;
    exportButton.disabled = value;
    loginButton.disabled = value;
    loginButton.textContent = value ? "Memproses..." : "Login";
    loadButton.textContent = value ? "Memuat..." : "Tampilkan Data";
  }

  function escapeCsv(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "Asia/Makassar"
    }).format(date);
  }

  function createCell(value) {
    const td = document.createElement("td");
    td.textContent = value ?? "-";
    return td;
  }

  function renderRecords(records) {
    const nameQuery = (filterName?.value || "").trim().toLocaleLowerCase("id-ID");
    if (nameQuery) records = records.filter(record =>
      String(record.full_name || "").toLocaleLowerCase("id-ID").includes(nameQuery)
    );
    attendanceRows.replaceChildren();

    if (!records.length) {
      const tr = document.createElement("tr");
      const td = createCell("Tidak ada data absensi untuk filter ini.");
      td.colSpan = 9;
      tr.appendChild(td);
      attendanceRows.appendChild(tr);
      summary.textContent = "Total: 0 catatan absensi.";
      return;
    }

    for (const record of records) {
      const tr = document.createElement("tr");

      tr.appendChild(createCell(formatDateTime(record.created_at)));
      tr.appendChild(createCell(record.full_name));
      tr.appendChild(createCell(record.study_program || "-"));
      tr.appendChild(createCell(record.session));
      tr.appendChild(createCell(record.attendance_type));
      tr.appendChild(createCell(
        record.is_manual_correction
          ? `Koreksi manual: ${record.correction_reason || "Alasan tidak tersedia"}`
          : "-"
      ));
      tr.appendChild(
        createCell(
          Number.isFinite(Number(record.distance_m))
            ? Math.round(Number(record.distance_m))
            : "-"
        )
      );

      const photoCell = document.createElement("td");

      if (record.photo_url) {
        const link = document.createElement("a");
        link.href = record.photo_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Lihat foto";
        link.className = "photo-link";
        photoCell.appendChild(link);
      } else {
        photoCell.textContent = "Tidak tersedia";
      }

      tr.appendChild(photoCell);

      // Tombol hapus untuk setiap baris.
      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");

      deleteButton.type = "button";
      deleteButton.textContent = "Hapus";
      deleteButton.className = "delete-attendance-button";
      deleteButton.addEventListener("click", () => {
        deleteAttendance(record);
      });

      actionCell.appendChild(deleteButton);
      tr.appendChild(actionCell);
      attendanceRows.appendChild(tr);
    }

    summary.textContent =
      `Total: ${records.length} catatan absensi yang ditampilkan.`;
  }

  async function loadAttendance() {
    if (busy) return;

    hideMessage(dashboardMessage);
    setBusy(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setLoggedIn(false);
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      const params = new URLSearchParams();

      if (filterDate.value) params.set("date", filterDate.value);
      if (filterSession.value) params.set("session", filterSession.value);
      if (filterType.value) params.set("attendance_type", filterType.value);
      if (filterProgram.value) {
        params.set("study_program", filterProgram.value);
      }

      const endpoint =
        `${config.SUPABASE_URL}/functions/v1/admin-attendance` +
        (params.size ? `?${params.toString()}` : "");

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: config.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        await supabase.auth.signOut();
        setLoggedIn(false);
        throw new Error("Sesi tidak valid. Silakan login kembali.");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal mengambil rekap absensi.");
      }

      currentRecords = Array.isArray(result.attendance)
        ? result.attendance
        : [];

      renderRecords(currentRecords);
      showMessage(
        dashboardMessage,
        "Rekap absensi berhasil dimuat.",
        "success"
      );
    } catch (error) {
      currentRecords = [];
      renderRecords([]);
      showMessage(
        dashboardMessage,
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat mengambil data.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAttendance(record) {
    if (busy) return;

    const confirmed = window.confirm(
      `Yakin ingin menghapus absensi ini?\n\n` +
      `Nama: ${record.full_name}\n` +
      `Program Studi: ${record.study_program || "-"}\n` +
      `Sesi: ${record.session}\n` +
      `Jenis: ${record.attendance_type}\n\n` +
      `Data yang dihapus tidak dapat dipulihkan melalui dashboard.`
    );

    if (!confirmed) return;

    hideMessage(dashboardMessage);
    setBusy(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setLoggedIn(false);
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      const response = await fetch(
        `${config.SUPABASE_URL}/functions/v1/admin-attendance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({
            action: "delete",
            id: record.id
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        await supabase.auth.signOut();
        setLoggedIn(false);
        throw new Error("Sesi tidak valid. Silakan login kembali.");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menghapus absensi.");
      }

      showMessage(
        dashboardMessage,
        result.message || "Absensi berhasil dihapus.",
        "success"
      );

      // Izinkan pemuatan ulang setelah penghapusan berhasil.
      setBusy(false);
      await loadAttendance();
    } catch (error) {
      showMessage(
        dashboardMessage,
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghapus absensi.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }


  const dayLabels = { "0": "Minggu", "1": "Senin", "2": "Selasa", "3": "Rabu", "4": "Kamis", "5": "Jumat", "6": "Sabtu" };
  const weeklyFields = {
    Pagi_Datang: ["weeklyPagiDatangStart", "weeklyPagiDatangEnd"],
    Pagi_Pulang: ["weeklyPagiPulangStart", "weeklyPagiPulangEnd"],
    Siang_Datang: ["weeklySiangDatangStart", "weeklySiangDatangEnd"],
    Siang_Pulang: ["weeklySiangPulangStart", "weeklySiangPulangEnd"]
  };

  async function scheduleRequest(action, payload = {}) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error("Sesi login berakhir. Silakan login kembali.");
    const response = await fetch(`${config.SUPABASE_URL}/functions/v1/manage-attendance-schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || "Gagal memproses pengaturan jadwal.");
    return result;
  }

  function setWeeklyForm(dayRows) {
    const byKey = new Map((dayRows || []).map(row => [`${row.session}_${row.attendance_type}`, row]));
    for (const [key, ids] of Object.entries(weeklyFields)) {
      const row = byKey.get(key);
      document.getElementById(ids[0]).value = row?.start_time || "";
      document.getElementById(ids[1]).value = row?.end_time || "";
    }
  }

  async function loadScheduleSettings() {
    try {
      const result = await scheduleRequest("get_all");
      const selectedDay = weeklyDay.value || "1";
      setWeeklyForm((result.weekly || []).filter(row => String(row.weekday) === String(selectedDay)));
      renderSpecialSchedules(result.special || []);
      hideMessage(scheduleMessage);
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal memuat jadwal.", "error");
    }
  }

  function renderSpecialSchedules(rows) {
    specialScheduleRows.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = createCell("Belum ada jadwal khusus.");
      td.colSpan = 6;
      tr.appendChild(td);
      specialScheduleRows.appendChild(tr);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.appendChild(createCell(row.attendance_date));
      tr.appendChild(createCell(row.session));
      tr.appendChild(createCell(row.attendance_type));
      tr.appendChild(createCell(`${String(row.start_time).slice(0,5)}–${String(row.end_time).slice(0,5)}`));
      tr.appendChild(createCell(row.reason || "-"));
      const td = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-attendance-button";
      button.textContent = "Hapus";
      button.addEventListener("click", async () => {
        if (!window.confirm(`Hapus jadwal khusus ${row.attendance_date}, sesi ${row.session}? Jadwal mingguan akan berlaku kembali.`)) return;
        try {
          await scheduleRequest("delete_special", { ids: row.ids || [row.id] });
          showMessage(scheduleMessage, "Jadwal khusus dihapus. Jadwal mingguan akan berlaku kembali.", "success");
          await loadScheduleSettings();
        } catch (error) {
          showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menghapus jadwal.", "error");
        }
      });
      td.appendChild(button);
      tr.appendChild(td);
      specialScheduleRows.appendChild(tr);
    }
  }

  weeklyDay?.addEventListener("change", async () => {
    try {
      const result = await scheduleRequest("get_all");
      setWeeklyForm((result.weekly || []).filter(row => String(row.weekday) === String(weeklyDay.value)));
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal memuat jadwal hari.", "error");
    }
  });

  weeklyScheduleForm?.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage(scheduleMessage);
    const rows = [];
    for (const [key, ids] of Object.entries(weeklyFields)) {
      const [session, attendance_type] = key.split("_");
      rows.push({
        weekday: Number(weeklyDay.value),
        session,
        attendance_type,
        start_time: document.getElementById(ids[0]).value,
        end_time: document.getElementById(ids[1]).value
      });
    }
    const button = document.getElementById("saveWeeklyScheduleButton");
    button.disabled = true;
    try {
      await scheduleRequest("save_weekly", { rows });
      showMessage(scheduleMessage, `Jadwal ${dayLabels[weeklyDay.value]} berhasil disimpan.`, "success");
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menyimpan jadwal mingguan.", "error");
    } finally {
      button.disabled = false;
    }
  });

  specialScheduleForm?.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage(scheduleMessage);
    if (specialStart.value >= specialEnd.value) {
      showMessage(scheduleMessage, "Jam selesai harus lebih akhir daripada jam mulai.", "error");
      return;
    }
    const button = document.getElementById("saveSpecialScheduleButton");
    button.disabled = true;
    try {
      await scheduleRequest("save_special", {
        attendance_date: specialDate.value,
        session: specialSession.value,
        attendance_type: specialAttendanceType.value,
        start_time: specialStart.value,
        end_time: specialEnd.value,
        reason: specialReason.value.trim()
      });
      showMessage(scheduleMessage, `Jadwal ${specialAttendanceType.value} khusus berhasil disimpan${specialSession.value === "Semua" ? " untuk sesi pagi dan siang" : ""}.`, "success");
      specialScheduleForm.reset();
      await loadScheduleSettings();
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menyimpan jadwal khusus.", "error");
    } finally {
      button.disabled = false;
    }
  });

  openScheduleButton?.addEventListener("click", showSchedule);
  backFromScheduleButton?.addEventListener("click", showRecap);
  specialDate.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  correctionDate.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  openCorrectionButton.addEventListener("click", showCorrection);
  backToRecapButton.addEventListener("click", showRecap);
  cancelCorrectionButton.addEventListener("click", showRecap);

  correctionForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage(correctionMessage);
    if (busy) return;
    const fullName = correctionName.value.trim().replace(/\s+/g, " ");
    const studyProgram = correctionProgram.value;
    const attendanceDate = correctionDate.value;
    const session = correctionSession.value;
    const reason = correctionReason.value.trim();
    if (fullName.length < 2 || !studyProgram || !attendanceDate || !session || reason.length < 8) {
      showMessage(correctionMessage, "Lengkapi seluruh data dan alasan minimal 8 karakter.", "error");
      return;
    }
    if (!window.confirm("Konfirmasi Koreksi Kehadiran\n\n" +
      "Pastikan kehadiran mahasiswa sudah diverifikasi sebelum menyimpan koreksi.\n\n" +
      "Nama: " + fullName + "\n" +
      "Prodi: " + studyProgram + "\n" +
      "Tanggal: " + attendanceDate + "\n" +
      "Sesi: " + session + "\n" +
      "Jenis koreksi: Datang\n" +
      "Alasan: " + reason)) return;
    correctionButton.disabled = true;
    correctionButton.textContent = "Menyimpan...";
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Sesi login berakhir. Silakan login kembali.");
      const response = await fetch(`${config.SUPABASE_URL}/functions/v1/admin-attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ action: "correct_arrival", full_name: fullName, study_program: studyProgram, attendance_date: attendanceDate, session, reason })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const detail = result.detail ? ` Detail: ${result.detail}` : "";
        const code = result.code ? ` (Kode: ${result.code})` : "";
        throw new Error((result.error || "Koreksi gagal disimpan.") + detail + code);
      }

      correctionForm.reset();
    
  const dayLabels = { "0": "Minggu", "1": "Senin", "2": "Selasa", "3": "Rabu", "4": "Kamis", "5": "Jumat", "6": "Sabtu" };
  const weeklyFields = {
    Pagi_Datang: ["weeklyPagiDatangStart", "weeklyPagiDatangEnd"],
    Pagi_Pulang: ["weeklyPagiPulangStart", "weeklyPagiPulangEnd"],
    Siang_Datang: ["weeklySiangDatangStart", "weeklySiangDatangEnd"],
    Siang_Pulang: ["weeklySiangPulangStart", "weeklySiangPulangEnd"]
  };

  async function scheduleRequest(action, payload = {}) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error("Sesi login berakhir. Silakan login kembali.");
    const response = await fetch(`${config.SUPABASE_URL}/functions/v1/manage-attendance-schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || "Gagal memproses pengaturan jadwal.");
    return result;
  }

  function setWeeklyForm(dayRows) {
    const byKey = new Map((dayRows || []).map(row => [`${row.session}_${row.attendance_type}`, row]));
    for (const [key, ids] of Object.entries(weeklyFields)) {
      const row = byKey.get(key);
      document.getElementById(ids[0]).value = row?.start_time || "";
      document.getElementById(ids[1]).value = row?.end_time || "";
    }
  }

  async function loadScheduleSettings() {
    try {
      const result = await scheduleRequest("get_all");
      const selectedDay = weeklyDay.value || "1";
      setWeeklyForm((result.weekly || []).filter(row => String(row.weekday) === String(selectedDay)));
      renderSpecialSchedules(result.special || []);
      hideMessage(scheduleMessage);
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal memuat jadwal.", "error");
    }
  }

  function renderSpecialSchedules(rows) {
    specialScheduleRows.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = createCell("Belum ada jadwal khusus.");
      td.colSpan = 6;
      tr.appendChild(td);
      specialScheduleRows.appendChild(tr);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.appendChild(createCell(row.attendance_date));
      tr.appendChild(createCell(row.session));
      tr.appendChild(createCell(row.attendance_type));
      tr.appendChild(createCell(`${String(row.start_time).slice(0,5)}–${String(row.end_time).slice(0,5)}`));
      tr.appendChild(createCell(row.reason || "-"));
      const td = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-attendance-button";
      button.textContent = "Hapus";
      button.addEventListener("click", async () => {
        if (!window.confirm(`Hapus jadwal khusus ${row.attendance_date}, sesi ${row.session}? Jadwal mingguan akan berlaku kembali.`)) return;
        try {
          await scheduleRequest("delete_special", { ids: row.ids || [row.id] });
          showMessage(scheduleMessage, "Jadwal khusus dihapus. Jadwal mingguan akan berlaku kembali.", "success");
          await loadScheduleSettings();
        } catch (error) {
          showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menghapus jadwal.", "error");
        }
      });
      td.appendChild(button);
      tr.appendChild(td);
      specialScheduleRows.appendChild(tr);
    }
  }

  weeklyDay?.addEventListener("change", async () => {
    try {
      const result = await scheduleRequest("get_all");
      setWeeklyForm((result.weekly || []).filter(row => String(row.weekday) === String(weeklyDay.value)));
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal memuat jadwal hari.", "error");
    }
  });

  weeklyScheduleForm?.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage(scheduleMessage);
    const rows = [];
    for (const [key, ids] of Object.entries(weeklyFields)) {
      const [session, attendance_type] = key.split("_");
      rows.push({
        weekday: Number(weeklyDay.value),
        session,
        attendance_type,
        start_time: document.getElementById(ids[0]).value,
        end_time: document.getElementById(ids[1]).value
      });
    }
    const button = document.getElementById("saveWeeklyScheduleButton");
    button.disabled = true;
    try {
      await scheduleRequest("save_weekly", { rows });
      showMessage(scheduleMessage, `Jadwal ${dayLabels[weeklyDay.value]} berhasil disimpan.`, "success");
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menyimpan jadwal mingguan.", "error");
    } finally {
      button.disabled = false;
    }
  });

  specialScheduleForm?.addEventListener("submit", async event => {
    event.preventDefault();
    hideMessage(scheduleMessage);
    if (specialStart.value >= specialEnd.value) {
      showMessage(scheduleMessage, "Jam selesai harus lebih akhir daripada jam mulai.", "error");
      return;
    }
    const button = document.getElementById("saveSpecialScheduleButton");
    button.disabled = true;
    try {
      await scheduleRequest("save_special", {
        attendance_date: specialDate.value,
        session: specialSession.value,
        attendance_type: specialAttendanceType.value,
        start_time: specialStart.value,
        end_time: specialEnd.value,
        reason: specialReason.value.trim()
      });
      showMessage(scheduleMessage, `Jadwal ${specialAttendanceType.value} khusus berhasil disimpan${specialSession.value === "Semua" ? " untuk sesi pagi dan siang" : ""}.`, "success");
      specialScheduleForm.reset();
      await loadScheduleSettings();
    } catch (error) {
      showMessage(scheduleMessage, error instanceof Error ? error.message : "Gagal menyimpan jadwal khusus.", "error");
    } finally {
      button.disabled = false;
    }
  });

  openScheduleButton?.addEventListener("click", showSchedule);
  backFromScheduleButton?.addEventListener("click", showRecap);
  specialDate.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  correctionDate.value = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Makassar",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());

      showRecap();
      await loadAttendance();
      window.alert(result.message || "Koreksi kehadiran berhasil dicatat beserta alasan dan identitas admin.");
    } catch (error) {
      showMessage(correctionMessage, error instanceof Error ? error.message : "Koreksi gagal disimpan.", "error");
    } finally {
      correctionButton.disabled = false;
      correctionButton.textContent = "Catat Koreksi Datang";
    }
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;

    hideMessage(loginMessage);
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (error || !data.session) {
        throw new Error("Login gagal. Periksa email dan password.");
      }

      passwordInput.value = "";
      setLoggedIn(true);
      await loadAttendance();
    } catch (error) {
      showMessage(
        loginMessage,
        error instanceof Error ? error.message : "Login gagal.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      await supabase.auth.signOut();
      currentRecords = [];
      renderRecords([]);
      setLoggedIn(false);
      showMessage(loginMessage, "Kamu sudah logout.", "success");
    } catch {
      showMessage(loginMessage, "Gagal logout. Coba lagi.", "error");
    } finally {
      logoutButton.disabled = false;
    }
  });

  loadButton.addEventListener("click", loadAttendance);
  filterName?.addEventListener("input", () => renderRecords(currentRecords));

  exportButton.addEventListener("click", () => {
    if (!currentRecords.length) {
      showMessage(
        dashboardMessage,
        "Tidak ada data untuk diekspor.",
        "error"
      );
      return;
    }

    const columns = [
      ["Tanggal absensi", "attendance_date"],
      ["Waktu", "created_at"],
      ["Nama", "full_name"],
      ["Program Studi", "study_program"],
      ["Sesi", "session"],
      ["Jenis absensi", "attendance_type"],
      ["Keterangan Koreksi", "correction_reason"],
      ["Latitude", "latitude"],
      ["Longitude", "longitude"],
      ["Akurasi GPS (m)", "accuracy_m"],
      ["Jarak (m)", "distance_m"]
    ];

    const rows = [
      columns.map(([label]) => escapeCsv(label)),
      ...currentRecords.map(record =>
        columns.map(([, key]) => {
          let value = record[key];

          if (key === "created_at") value = formatDateTime(value);

          if (
            typeof value === "string" &&
            /^[\s]*[=+\-@]/.test(value)
          ) {
            value = `'${value}`;
          }

          return escapeCsv(value);
        })
      )
    ];

    const csv = "\uFEFF" + rows.map(row => row.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `rekap-absensi-${filterDate.value || "semua-tanggal"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  async function initialize() {
    if (
      !config ||
      !config.SUPABASE_URL ||
      !config.SUPABASE_PUBLISHABLE_KEY ||
      !window.supabase
    ) {
      showMessage(
        loginMessage,
        "Konfigurasi Supabase atau library belum tersedia.",
        "error"
      );
      return;
    }

    supabase = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      setLoggedIn(false);
      showMessage(loginMessage, "Gagal memeriksa sesi login.", "error");
      return;
    }

    setLoggedIn(Boolean(data.session));

    if (data.session) await loadAttendance();
  }

  initialize();
})();
