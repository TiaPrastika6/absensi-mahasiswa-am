window.APP_CONFIG = {
  SUPABASE_URL: "https://ylimvcmvmubwsfjsbzud.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_CkCKoGD_CDb_fciSTfqWoA_AHzM8eFd",

  SCHOOL: {
    NAME: "SMP Negeri 6 Singaraja",
    LATITUDE: -8.122987,
    LONGITUDE: 115.091534,
    RADIUS_METERS: 150,
    MAX_GPS_ACCURACY_METERS: 100
  },

  PHOTO: {
    MAX_SIZE_BYTES: 1024 * 1024,
    TARGET_SIZE_BYTES: 250 * 1024,
    ALLOWED_OUTPUT_TYPE: "image/jpeg"
  },

  ATTENDANCE: {
    SESSIONS: ["Pagi", "Siang"],
    TYPES: ["Datang", "Pulang"]
  }
};
