(() => {
  "use strict";

  const config = window.APP_CONFIG;

  const form = document.getElementById("attendanceForm");
  const nameInput = document.getElementById("fullName");
  const nimInput = document.getElementById("nim");
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

  function showMessage(message, type = "info") {
    formMessage.textContent = message;
    formMessage.className = `message ${type}`;
    formMessage.hidden = false;
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

      showMessage("Lokasi memenuhi batas pemeriksaan awal.", "success");
    } catch (error) {
      currentLocation = null;
      locationStatus.textContent = error.message;
      showMessage(error.message, "error");
    } finally {
      checkLocationButton.disabled = false;
    }
  }

  // Ubah foto yang didukung browser menjadi JPEG dan kompres ukurannya.
  // Jika browser tidak dapat membaca HEIC, minta pengguna memilih foto lain.
  async function compressPhoto(file) {
    const supportedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif"
    ];

    if (!file || !supportedTypes.includes(file.type.toLowerCase())) {
      throw new Error(
        "Format foto tidak didukung. Pilih JPG, PNG, atau WebP."
      );
    }

    if (file.size === 0) {
      throw new Error("File foto kosong atau tidak valid.");
    }

    if (file.type === "image/heic" || file.type === "image/heif") {
      throw new Error(
        "Browser belum dapat membaca foto HEIC/HEIF ini. " +
        "Pilih foto JPEG/JPG dari galeri, atau ubah format foto pada perangkat."
      );
    }

    const bitmap = await createImageBitmap(file);

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
        throw new Error("Tidak dapat memproses foto pada browser ini.");
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let quality = 0.82;
      let output = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );

      while (output && output.size > config.PHOTO.TARGET_SIZE_BYTES &&
             quality > 0.35) {
        quality -= 0.1;
        output = await new Promise(resolve =>
          canvas.toBlob(resolve, "image/jpeg", quality)
        );
      }

      if (!output) {
        throw new Error("Gagal mengubah foto menjadi JPEG.");
      }

      if (output.size > config.PHOTO.MAX_SIZE_BYTES) {
        throw new Error(
          "Foto masih terlalu besar setelah kompresi. Pilih foto lain."
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
    const nim = nimInput.value.trim();
    const session = sessionInput.value;
    const attendanceType = form.querySelector(
      'input[name="attendance_type"]:checked'
    )?.value;
    const photoFile = photoInput.files?.[0];

    if (!/^[0-9]{3,30}$/.test(nim)) {
      showMessage("NIM harus terdiri dari 3–30 angka.", "error");
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

      showMessage("Sedang memproses foto...", "info");
      const compressedPhoto = await compressPhoto(photoFile);

      const formData = new FormData();
      formData.append("full_name", fullName);
      formData.append("nim", nim);
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

      showMessage(
        `${result.message} Simpan informasi ini sebagai konfirmasi absensi kamu.`,
        "success"
      );

      // Jangan hapus identitas atau foto otomatis sebelum pengguna melihat hasil.
      photoInput.value = "";
      resetPhotoPreview();
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan. Silakan coba lagi.",
        "error"
      );
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Kirim Absensi";
    }
  });
})();
